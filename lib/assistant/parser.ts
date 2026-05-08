/**
 * Hebrew question parser → { intent, range, name, debug }.
 *
 * Heuristic, not AI. Three-stage pipeline:
 *
 *   1. Synonym groups recognize concepts ("patient", "session", "missing", …)
 *      via word-boundary stem matching, so 'מטופל*' covers
 *      מטופל / מטופלת / מטופלות / מטופלים without a long alias list.
 *
 *   2. A scoring function per intent — each rule looks at which groups
 *      were hit, plus whether a date range or a patient name was extracted.
 *      The highest-scoring intent above the threshold wins.
 *
 *   3. Fallbacks before giving up. A bare date phrase ("מה היה ביום שני?")
 *      defaults to sessionsByDate; a bare name ("ספרי לי על שרה") defaults
 *      to patientTimeline. We only return 'unknown' when the question has
 *      no domain anchor at all.
 *
 * The `debug` field exposes the top scored candidates so the API can log
 * what the parser was thinking. Useful when adding new phrasings.
 */

import { parseHebrewDateRange, type DateRange } from './dates';

export type Intent =
  | 'sessionsByDate'
  | 'upcomingSessions'
  | 'missingSummaries'
  | 'openPayments'
  | 'unprocessedRecordings'
  | 'patientDocuments'
  | 'patientTimeline'
  | 'listPatients'
  | 'help'
  | 'unknown';

export interface ParsedQuestion {
  intent: Intent;
  range?: DateRange;
  name?:  string;
  raw:    string;
  /** Top scored candidates (descending). Useful for server logs. */
  debug?: { intent: Intent; score: number }[];
}

/* ── 1. Synonym groups ─────────────────────────────────────────────────
 *
 * Entries ending with `*` are stems — they match any word that starts
 * with that prefix (so 'מטופל*' matches מטופלת, מטופלות, מטופלים, …).
 * Entries without `*` must match as a whole word.
 */

const SYN: Record<string, string[]> = {
  // ── domain entities ──
  patient:    ['מטופל*', 'לקוח*'],
  session:    ['פגיש*', 'מפגש*', 'יומן', 'session*', 'טיפול*'],
  summary:    ['סיכומ*', 'תיעוד*'],
  payment:    ['תשלומ*', 'שולמ*', 'שילמ*'],
  recording:  ['הקלט*', 'תמלול*'],
  document:   ['מסמכ*', 'מסמך', 'קבצים', 'קובץ', 'מסמכים'],

  // ── qualifiers ──
  missing:    ['חסר*', 'ללא', 'בלי'],
  open:       ['פתוח*', 'פתוחה', 'טרם'],
  unpaid:     ['לא_שולם'],   // joined token; we look for the phrase explicitly
  unprocessed:['ממתינ*', 'ממתינה', 'ממתינות', 'ממתינים'],
  upcoming:   ['הבא', 'הבאה', 'הבאים', 'הקרוב', 'הקרובה', 'הקרובים'],

  // ── question words / verbs that signal "list / count" ──
  count:      ['כמה', 'מספר'],
  who:        ['מי', 'מיהי', 'מיהן'],
  which:      ['איזה', 'איזו', 'אילו'],
  show:       ['תראי', 'הראי', 'הצגי', 'תני', 'תראה', 'הראה'],
  exists:     ['יש', 'האם'],
  registered: ['רשומ*'],

  // ── attendance verbs (sessions context) ──
  attendance: ['מגיע*', 'בא*', 'נוכח*'],

  // ── help phrasing ──
  help:       ['עזרה', 'דוגמאות', 'מה_אפשר_לשאול'],
};

/* ── 2. Word-boundary matching ─────────────────────────────────────── */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[״׳]/g, '"')
    .replace(/[?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match `term` (with optional trailing '*' stem marker) inside `text` with
 * Hebrew/Latin word boundaries. The boundary is "any char that isn't a
 * Hebrew letter or ASCII letter".
 */
function termMatches(text: string, term: string): boolean {
  const padded = ' ' + normalize(text) + ' ';
  if (term.includes('_')) {
    // Special tokens like 'לא_שולם' → match the literal phrase with a space.
    const phrase = term.replace(/_/g, ' ').toLowerCase();
    return padded.includes(' ' + phrase + ' ') || padded.includes(' ' + phrase);
  }
  const stem = term.endsWith('*');
  const core = stem ? term.slice(0, -1) : term;
  // Boundary char class — chars that can't be part of a Hebrew/Latin word.
  const B = `[^\\u0590-\\u05FFa-z]`;
  const pattern = stem
    ? `${B}${escapeRegex(core.toLowerCase())}[\\u0590-\\u05FFa-z]*${B}`
    : `${B}${escapeRegex(core.toLowerCase())}${B}`;
  return new RegExp(pattern, 'iu').test(padded);
}

function hasGroup(text: string, group: keyof typeof SYN): boolean {
  return (SYN[group] ?? []).some(t => termMatches(text, t));
}

/* ── 3. Patient name extraction ────────────────────────────────────── */

const NAME_STOPWORDS = new Set([
  'היום', 'מחר', 'אתמול', 'שלשום', 'השבוע', 'החודש', 'שבוע', 'חודש',
  'יום', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
  'מטופלת', 'מטופלות', 'מטופל', 'מטופלים', 'לקוחה', 'לקוחות',
  'פגישה', 'פגישות', 'סיכום', 'סיכומים', 'תשלום', 'תשלומים',
  'הקלטה', 'הקלטות', 'מסמך', 'מסמכים',
  'הבא', 'הבאה', 'הקרוב', 'הקרובה', 'אחרון', 'אחרונה',
  'כל', 'כלל', 'איזו', 'איזה', 'אילו', 'מי', 'מה', 'מתי', 'איפה',
  'יש', 'הייתה', 'היה', 'היתה', 'האם', 'את',
]);

function extractPatientName(text: string): string | undefined {
  const stripped = text.replace(/[?!.]+$/g, '');

  // Quoted: "שרה כהן"  or  'שרה'
  const quoted = stripped.match(/["']([^"']{2,})["']/);
  if (quoted) return quoted[1].trim();

  // After "של" / "עבור" / "למטופלת" / "למטופל" / "ספרי לי על"
  const m = stripped.match(/(?:של|עבור|למטופלת|למטופל|ספרי\s+לי\s+על|ספר\s+לי\s+על)\s+([֐-׿\s'״׳]+?)(?=[?,.!]|$)/);
  if (!m) return undefined;

  // If the captured phrase IS a date phrase, this isn't a name.
  if (parseHebrewDateRange(m[1])) return undefined;

  const tokens = m[1].trim().split(/\s+/).filter(w => !NAME_STOPWORDS.has(w));
  const candidate = tokens.slice(0, 3).join(' ').trim();
  return candidate.length >= 2 ? candidate : undefined;
}

/* ── 4. Intent scoring rules ───────────────────────────────────────── */

interface ScoringContext {
  text:     string;
  hasRange: boolean;
  hasName:  boolean;
}

interface IntentRule {
  intent: Intent;
  score:  (ctx: ScoringContext) => number;
}

/**
 * Each rule returns a numeric score. Zero = the rule rejects this question.
 * The rules are non-overlapping in spirit but can score in parallel —
 * the dispatcher just picks the highest.
 *
 * Score scale:
 *   1 = weak signal     (e.g. just "פגישה" without a date)
 *   2 = moderate signal (one solid keyword group hit)
 *   3 = strong signal   (two groups, or keyword + range/name)
 *   4+ = very strong    (multiple groups + range/name)
 */
const RULES: IntentRule[] = [
  // ── Help — explicit "עזרה" / "מה אפשר לשאול"
  {
    intent: 'help',
    score: ({ text }) => {
      if (/^(עזרה|דוגמאות)\b/.test(text)) return 100;
      if (/(מה אתה יודע|מה את יודעת|מה אפשר לשאול)/.test(text)) return 100;
      return 0;
    },
  },

  // ── Missing summaries — needs both 'חסר' and 'סיכום'
  {
    intent: 'missingSummaries',
    score: ({ text }) => {
      const m = hasGroup(text, 'missing');
      const s = hasGroup(text, 'summary');
      if (m && s) return 4;
      // "למי חסר…" pattern (without explicit 'סיכום' word but the entity is
      // implied by context) — treat carefully. We only fire here if the user
      // didn't ask about something else.
      return 0;
    },
  },

  // ── Open payments
  {
    intent: 'openPayments',
    score: ({ text }) => {
      const p = hasGroup(text, 'payment');
      const o = hasGroup(text, 'open');
      const u = /לא\s+שולמ|טרם\s+שולמ/.test(text);
      if (p && (o || u)) return 4;
      if (p) return 2; // bare "תשלומים" — show open payments by default
      return 0;
    },
  },

  // ── Unprocessed recordings
  {
    intent: 'unprocessedRecordings',
    score: ({ text }) => {
      const r = hasGroup(text, 'recording');
      const u = hasGroup(text, 'unprocessed') || /לא\s+(?:עובד|תומלל)/.test(text);
      if (r && u) return 4;
      if (r) return 2; // bare "הקלטות" — default to pending
      return 0;
    },
  },

  // ── Documents for a patient — needs 'document' AND a name
  {
    intent: 'patientDocuments',
    score: ({ text, hasName }) => {
      if (!hasGroup(text, 'document')) return 0;
      return hasName ? 4 : 1;
    },
  },

  // ── Sessions in a date range
  {
    intent: 'sessionsByDate',
    score: ({ text, hasRange }) => {
      let s = 0;
      if (hasRange)                         s += 2;
      if (hasGroup(text, 'session'))        s += 2;
      if (hasGroup(text, 'attendance'))     s += 1;
      return s;
    },
  },

  // ── Upcoming sessions (no specific date, just "the next ones")
  {
    intent: 'upcomingSessions',
    score: ({ text, hasRange }) => {
      if (hasRange) return 0; // sessionsByDate handles ranged questions
      let s = 0;
      if (hasGroup(text, 'session'))  s += 2;
      if (hasGroup(text, 'upcoming')) s += 2;
      return s;
    },
  },

  // ── List of patients (count / show / "is there?")
  {
    intent: 'listPatients',
    score: ({ text, hasName }) => {
      if (hasName) return 0;                    // patientTimeline takes priority
      if (!hasGroup(text, 'patient')) return 0;
      let s = 2;                                // base for 'patient' word
      if (hasGroup(text, 'count'))      s += 2;
      if (hasGroup(text, 'show'))       s += 1;
      if (hasGroup(text, 'which'))      s += 1;
      if (hasGroup(text, 'who'))        s += 1;
      if (hasGroup(text, 'exists'))     s += 1;
      if (hasGroup(text, 'registered')) s += 1;
      return s;
    },
  },

  // ── Specific patient timeline
  {
    intent: 'patientTimeline',
    score: ({ hasName }) => hasName ? 3 : 0,
  },
];

/* ── 5. Public entry point ─────────────────────────────────────────── */

const MIN_SCORE = 2; // anything below this is too weak to act on

export function parseQuestion(raw: string, now: Date = new Date()): ParsedQuestion {
  const text  = normalize(raw);
  const range = parseHebrewDateRange(raw, now) ?? undefined;
  const name  = extractPatientName(raw);

  const ctx: ScoringContext = { text, hasRange: !!range, hasName: !!name };

  // Score every rule; keep the non-zero ones in descending order.
  const scored = RULES
    .map(r => ({ intent: r.intent, score: r.score(ctx) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && scored[0].score >= MIN_SCORE) {
    return { intent: scored[0].intent, range, name, raw, debug: scored.slice(0, 3) };
  }

  // Fallbacks — these fire when no rule passed the threshold.
  if (range) {
    return {
      intent: 'sessionsByDate', range, name, raw,
      debug: [{ intent: 'sessionsByDate', score: 1 }, ...scored.slice(0, 2)],
    };
  }
  if (name) {
    return {
      intent: 'patientTimeline', range, name, raw,
      debug: [{ intent: 'patientTimeline', score: 1 }, ...scored.slice(0, 2)],
    };
  }

  return { intent: 'unknown', range, name, raw, debug: scored.slice(0, 3) };
}
