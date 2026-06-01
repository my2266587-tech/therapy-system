/**
 * Fuzzy patient-name matching for phone-summary drafts.
 *
 *   Phone transcripts garble Hebrew names ("מלכי פאנעט" → "מרכי פנס
 *   דוקוס"), and patient records carry suffixes after a dash
 *   ("מלכי פאנעט - בדיקות"). A plain ILIKE misses both. matchPatient
 *   normalizes both sides and scores them with a token-coverage metric so
 *   a lightly-mistranscribed name still finds its patient — while staying
 *   conservative: if two patients are equally plausible it reports
 *   `ambiguous` and leaves the choice to the clinician.
 *
 *   This module only decides the match. It does not touch the DB beyond the
 *   single read the caller passes in, and never writes.
 */

export interface PatientRow {
  id: string;
  full_name: string;
}

export interface MatchResult {
  matched_patient_id: string | null;
  match_status: 'matched' | 'ambiguous' | 'not_found';
  /** The spoken name, cleaned + shortened for storage (not a full sentence). */
  cleanedName: string;
}

/* ── Tuning ───────────────────────────────────────────────────────
 * A candidate must cover at least CONTENDER of its name tokens (fuzzily)
 * to be considered at all. Among contenders, the top wins outright only if
 * it beats the runner-up by GAP; otherwise it's ambiguous. */
const CONTENDER = 0.5;
const GAP = 0.12;

/**
 * Normalize a Hebrew name for comparison:
 *   - drop anything after a dash/hyphen ("… - בדיקות" → "…")
 *   - strip nikud (combining marks U+0591–U+05C7)
 *   - strip punctuation / gershayim / quotes
 *   - collapse whitespace, trim
 */
export function normalizeName(raw: string): string {
  if (!raw) return '';
  let s = raw.normalize('NFKC');
  // Cut at the first dash variant — record suffixes live after it.
  s = s.split(/[-־–—]/)[0];
  // Remove Hebrew nikud / cantillation.
  s = s.replace(/[֑-ׇ]/g, '');
  // Remove gershayim/geresh and common punctuation.
  s = s.replace(/["'״׳.,;:()\[\]{}/\\!?*]/g, ' ');
  // Collapse whitespace.
  return s.replace(/\s+/g, ' ').trim();
}

/** Levenshtein edit distance between two short strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Similarity of two tokens in [0,1] (1 = identical). */
function tokenSim(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Coverage score in [0,1]: for each token of the candidate (the canonical,
 * usually shorter name), how well is it covered by the BEST matching spoken
 * token. Averaged over candidate tokens. This tolerates extra junk tokens
 * in the transcript without penalty.
 */
function coverageScore(spokenTokens: string[], candTokens: string[]): number {
  if (candTokens.length === 0 || spokenTokens.length === 0) return 0;
  let sum = 0;
  for (const ct of candTokens) {
    let best = 0;
    for (const st of spokenTokens) {
      const sim = tokenSim(ct, st);
      if (sim > best) best = sim;
    }
    sum += best;
  }
  return sum / candTokens.length;
}

/** Trim the spoken name to a short, storable form (≤4 tokens, ≤40 chars). */
function shortenSpoken(normalized: string): string {
  const tokens = normalized.split(' ').filter(Boolean).slice(0, 4);
  let out = tokens.join(' ');
  if (out.length > 40) out = out.slice(0, 40).trim();
  return out;
}

/**
 * Match a spoken name against the patient list. Pure scoring + logging;
 * the caller supplies the candidate rows and persists the decision.
 */
export function matchPatient(spokenRaw: string, patients: PatientRow[]): MatchResult {
  const spokenNorm = normalizeName(spokenRaw);
  const cleanedName = shortenSpoken(spokenNorm) || spokenRaw.trim();

  console.log(`[phone-match] spoken raw: ${spokenRaw}`);
  console.log(`[phone-match] spoken normalized: ${spokenNorm}`);

  if (!spokenNorm || patients.length === 0) {
    console.log('[phone-match] result: not_found (no spoken name or no patients)');
    return { matched_patient_id: null, match_status: 'not_found', cleanedName };
  }

  const spokenTokens = spokenNorm.split(' ').filter(Boolean);

  const scored = patients.map((p) => {
    const norm = normalizeName(p.full_name);
    const score = coverageScore(spokenTokens, norm.split(' ').filter(Boolean));
    return { p, norm, score };
  });
  scored.sort((a, b) => b.score - a.score);

  console.log(
    `[phone-match] candidate normalized names: ${scored
      .slice(0, 5)
      .map((s) => `${s.norm}=${s.score.toFixed(2)}`)
      .join(' | ')}`,
  );

  const contenders = scored.filter((s) => s.score >= CONTENDER);
  const top = scored[0];
  console.log(`[phone-match] best candidate: ${top.norm}`);
  console.log(`[phone-match] score: ${top.score.toFixed(3)}`);

  if (contenders.length === 0) {
    console.log('[phone-match] result: not_found');
    return { matched_patient_id: null, match_status: 'not_found', cleanedName };
  }

  if (contenders.length === 1) {
    console.log('[phone-match] result: matched');
    return { matched_patient_id: top.p.id, match_status: 'matched', cleanedName };
  }

  // Multiple contenders — a clear winner needs a margin over the runner-up.
  const gap = contenders[0].score - contenders[1].score;
  if (gap >= GAP) {
    console.log(`[phone-match] result: matched (gap ${gap.toFixed(3)})`);
    return { matched_patient_id: top.p.id, match_status: 'matched', cleanedName };
  }

  console.log(`[phone-match] result: ambiguous (gap ${gap.toFixed(3)})`);
  return { matched_patient_id: null, match_status: 'ambiguous', cleanedName };
}
