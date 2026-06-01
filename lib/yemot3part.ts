/**
 * Shared pipeline for the guided 3-recording phone summary.
 *
 *   processThreeParts({ part1Path, part2Path, part3Path }) downloads each
 *   Yemot recording to memory, transcribes it, asks the model to split the
 *   three position-known transcripts into the structured
 *   phone_summary_drafts fields, runs the same ILIKE patient match the
 *   other routes use, and creates ONE draft.
 *
 *   Audio is never written to disk / Supabase and never returned; the Yemot
 *   files are left in place. Only transcript text + draft fields persist.
 *
 *   This is the single source of truth for the flow. Both the admin probe
 *   (/api/admin/yemot-3part-summary-test, explicit paths) and the future
 *   phone webhook (/api/phone/yemot-process-latest, auto-discovered paths)
 *   call it, so behaviour can't drift between them.
 */

import { fetchFile } from '@/lib/yemot';
import { createServerClient } from '@/lib/supabaseServer';
import { matchPatient } from '@/lib/patientMatch';
import OpenAI, { toFile } from 'openai';

// Cheap, Hebrew-capable models (same as the original probe route).
const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const STRUCTURE_MODEL = 'gpt-4o-mini';

const TAG = '[yemot-3part]';

/** The structured content fields we ask the model to fill. */
const FIELD_KEYS = [
  'spoken_patient_name',
  'current_state',
  'main_topics',
  'treatment_actions',
  'next_steps',
  'tasks_given',
  'progress',
  'difficulties',
  'notes',
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type Fields = Record<FieldKey, string>;

export interface ThreePartInput {
  part1Path: string;
  part2Path: string;
  part3Path: string;
}

export interface ThreePartOk {
  ok: true;
  draft_id: string;
  status: 'draft_ready' | 'needs_match';
  match_status: 'matched' | 'ambiguous' | 'not_found';
  parts: { part1_chars: number; part2_chars: number; part3_chars: number };
  call_date: string;
}

export interface ThreePartErr {
  ok: false;
  error: string;
  /** HTTP status the caller should respond with. */
  httpStatus: number;
}

export type ThreePartResult = ThreePartOk | ThreePartErr;

/* ── Helpers ─────────────────────────────────────────────────────── */

function fileNameFromPath(path: string): string {
  const base = path.split('/').pop();
  return base && base.length > 0 ? base : 'recording.wav';
}

/** Today's date in Israel as YYYY-MM-DD (en-CA gives that exact shape). */
function israelToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Download + transcribe a single Yemot path. Throws on any failure. */
async function transcribePath(openai: OpenAI, path: string): Promise<string> {
  const dl = await fetchFile(path);
  if (!dl.ok) throw new Error(`download ${path}: ${dl.error}`);

  const file = await toFile(dl.buffer, fileNameFromPath(path));
  const result = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    language: 'he',
  });
  const text = (result.text ?? '').trim();
  if (!text) throw new Error(`empty transcript for ${path}`);
  return text;
}

/**
 * Ask the model to split the three position-known transcripts into the
 * structured fields. Returns every FIELD_KEY as a (possibly empty) string.
 */
async function structureFields(
  openai: OpenAI,
  part1: string,
  part2: string,
  part3: string,
): Promise<Fields> {
  const system = [
    'את עוזרת שממירה תמלול של סיכום שיחת טיפול לשדות מובנים בעברית.',
    'התמלול מגיע בשלושה חלקים, כל חלק מכסה נושאים ידועים מראש:',
    '- חלק 1: שם המטופלת + מצב נוכחי.',
    '- חלק 2: נושאים חשובים שעלו + מה עשינו בטיפול.',
    '- חלק 3: משימות שקיבלה, התקדמות, קושי בהתקדמות, עם מה מתחילים',
    '  בפגישה הבאה, והערות נוספות.',
    '',
    'כללים מחייבים:',
    '- אל תמציאי מידע. השתמשי רק במה שנאמר בתמלול.',
    '- אם שדה לא נאמר — החזירי מחרוזת ריקה "".',
    '- אם שם המטופלת לא ברור — spoken_patient_name = "צריך שיוך מטופלת".',
    '- notes מיועד רק למה שלא מתאים לאף שדה אחר.',
    '- החזירי אך ורק JSON עם המפתחות הבאים, ערכים כמחרוזות בעברית:',
    '  spoken_patient_name, current_state, main_topics, treatment_actions,',
    '  next_steps, tasks_given, progress, difficulties, notes.',
  ].join('\n');

  const user = [
    '[חלק 1 — שם מטופלת + מצב נוכחי]',
    part1,
    '',
    '[חלק 2 — נושאים שעלו + מה עשינו בטיפול]',
    part2,
    '',
    '[חלק 3 — משימות, התקדמות, קושי, פגישה הבאה, הערות]',
    part3,
  ].join('\n');

  const resp = await openai.chat.completions.create({
    model: STRUCTURE_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? '{}';
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('model returned non-JSON structured output');
  }

  const out = {} as Fields;
  for (const key of FIELD_KEYS) {
    const v = parsed[key];
    out[key] = typeof v === 'string' ? v.trim() : '';
  }
  if (!out.spoken_patient_name) out.spoken_patient_name = 'צריך שיוך מטופלת';
  return out;
}

/** Tidy raw transcripts for storage in source_transcript. */
function buildSourceTranscript(part1: string, part2: string, part3: string): string {
  return [`[חלק 1]\n${part1}`, `[חלק 2]\n${part2}`, `[חלק 3]\n${part3}`].join('\n\n');
}

/* ── Main pipeline ───────────────────────────────────────────────── */

/**
 * Runs the full flow for three already-resolved Yemot paths. Callers are
 * responsible for validating the paths (ivr2:/ prefix) before calling.
 */
export async function processThreeParts(input: ThreePartInput): Promise<ThreePartResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: 'OPENAI_API_KEY not configured', httpStatus: 500 };
  }

  const openai = new OpenAI();

  // ── 1. Download + transcribe each part (audio stays in memory) ──
  let part1: string, part2: string, part3: string;
  try {
    // Sequential keeps memory low — only one audio buffer alive at a time.
    part1 = await transcribePath(openai, input.part1Path);
    part2 = await transcribePath(openai, input.part2Path);
    part3 = await transcribePath(openai, input.part3Path);
  } catch (e) {
    console.error(`${TAG} transcription failed:`, (e as Error).message);
    return { ok: false, error: `transcription failed: ${(e as Error).message}`, httpStatus: 502 };
  }

  // ── 2. Structure into fields by position ───────────────────────
  let fields: Fields;
  try {
    fields = await structureFields(openai, part1, part2, part3);
  } catch (e) {
    console.error(`${TAG} structuring failed:`, (e as Error).message);
    return { ok: false, error: `structuring failed: ${(e as Error).message}`, httpStatus: 502 };
  }

  // ── 3. Patient match (fuzzy — transcripts garble Hebrew names) ─
  const supabase = createServerClient();
  const name = fields.spoken_patient_name.trim();
  const isPlaceholder = name === 'צריך שיוך מטופלת';

  let matched_patient_id: string | null = null;
  let match_status: 'matched' | 'ambiguous' | 'not_found' = 'not_found';
  let status: 'draft_ready' | 'needs_match' = 'needs_match';
  // Stored name: the cleaned/short spoken form when we have one.
  let storedName = name;

  if (name && !isPlaceholder) {
    // Fetch the full list — a mistranscribed name won't survive an ILIKE
    // filter, so scoring happens in-process against every patient.
    const { data: candidates, error: lookupErr } = await supabase
      .from('patients')
      .select('id, full_name');
    if (lookupErr) {
      console.error(`${TAG} patient lookup failed:`, lookupErr.message);
      return { ok: false, error: `patient lookup: ${lookupErr.message}`, httpStatus: 500 };
    }
    const result = matchPatient(name, candidates ?? []);
    matched_patient_id = result.matched_patient_id;
    match_status = result.match_status;
    if (result.cleanedName) storedName = result.cleanedName;
    if (match_status === 'matched') status = 'draft_ready';
  }

  // ── 4. Create one draft ────────────────────────────────────────
  const call_date = israelToday();
  const emptyToNull = (s: string): string | null => (s.length > 0 ? s : null);

  const { data, error: insErr } = await supabase
    .from('phone_summary_drafts')
    .insert({
      spoken_patient_name: storedName || null,
      matched_patient_id,
      match_status,
      status,
      current_state:     emptyToNull(fields.current_state),
      main_topics:       emptyToNull(fields.main_topics),
      treatment_actions: emptyToNull(fields.treatment_actions),
      next_steps:        emptyToNull(fields.next_steps),
      tasks_given:       emptyToNull(fields.tasks_given),
      progress:          emptyToNull(fields.progress),
      difficulties:      emptyToNull(fields.difficulties),
      notes:             emptyToNull(fields.notes),
      call_date,
      source_transcript: buildSourceTranscript(part1, part2, part3),
    })
    .select('id')
    .single();
  if (insErr) {
    console.error(`${TAG} draft creation failed:`, insErr.message);
    return { ok: false, error: `draft creation failed: ${insErr.message}`, httpStatus: 500 };
  }

  console.log(`${TAG} draft created: id=${data.id} status=${status} match=${match_status}`);

  return {
    ok: true,
    draft_id: data.id,
    status,
    match_status,
    parts: {
      part1_chars: part1.length,
      part2_chars: part2.length,
      part3_chars: part3.length,
    },
    call_date,
  };
}
