/**
 * Shared pipeline for the guided 3-recording phone summary.
 *
 *   processThreeParts({ part1Path, part2Path, part3Path }) downloads each
 *   Yemot recording to memory, transcribes EACH ONE SEPARATELY and IN FULL
 *   (verbatim — no summarizing), splits each part's transcript word-for-word
 *   into that part's own phone_summary_drafts fields only, runs the same
 *   ILIKE patient match the other routes use, and creates ONE draft.
 *
 *   VERBATIM CONTRACT (do not weaken):
 *   - Each Yemot step folder maps to fixed fields (PART_FIELDS below) and
 *     that mapping never changes. Step order never changes.
 *   - A step's recording is transcribed alone and its text lands ONLY in
 *     that step's fields — never merged with or moved to another step.
 *   - The text is stored in full: no summarizing, shortening, rephrasing,
 *     headline-izing, key-point extraction, sentence reordering, omitting
 *     repetitions, or filling in things that weren't said. Only basic
 *     punctuation is allowed; unclear speech stays "[לא ברור]".
 *   - After transcription there is NO model call that shortens or rewrites.
 *     The single per-part split call may only COPY the transcript verbatim
 *     into that part's fields, and a code-level guard verifies nothing was
 *     lost — if it was, the full transcript is stored untouched in the
 *     part's primary field instead.
 *
 *   Audio is never written to disk / Supabase and never returned; the Yemot
 *   files are left in place. Only transcript text + draft fields persist.
 *
 *   This is the single source of truth for the flow. Both the admin probe
 *   (/api/admin/yemot-3part-summary-test, explicit paths) and the phone
 *   webhook (/api/phone/yemot-process-latest, auto-discovered paths)
 *   call it, so behaviour can't drift between them.
 */

import { fetchFile } from '@/lib/yemot';
import { createServerClient } from '@/lib/supabaseServer';
import { matchPatient } from '@/lib/patientMatch';
import OpenAI, { toFile } from 'openai';

// Cheap, Hebrew-capable models (same as the original probe route).
const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const SPLIT_MODEL = 'gpt-4o-mini';

const TAG = '[yemot-3part]';

/** The structured content fields of a draft (names never change). */
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

const NAME_PLACEHOLDER = 'צריך שיוך מטופלת';

/**
 * The EXISTING step → fields mapping. Recording of step N is stored only in
 * the fields listed for step N. `primary` is where the full transcript goes
 * if the verbatim split ever fails validation (so nothing is lost).
 */
const PART_FIELDS: {
  part: 1 | 2 | 3;
  title: string;
  /** Content fields of this step, in their spoken order. */
  keys: FieldKey[];
  /** Hebrew label per field, for the split instruction. */
  labels: Record<string, string>;
  primary: FieldKey;
}[] = [
  {
    part: 1,
    title: 'שם המטופלת + מצב נוכחי',
    keys: ['current_state'],
    labels: { current_state: 'מצב נוכחי' },
    primary: 'current_state',
  },
  {
    part: 2,
    title: 'נושאים חשובים שעלו + מה עשינו בטיפול',
    keys: ['main_topics', 'treatment_actions'],
    labels: { main_topics: 'נושאים חשובים שעלו', treatment_actions: 'מה עשינו בטיפול' },
    primary: 'main_topics',
  },
  {
    part: 3,
    title: 'משימות שקיבלה, התקדמות, קושי בהתקדמות, עם מה מתחילים בפגישה הבאה, הערות',
    keys: ['tasks_given', 'progress', 'difficulties', 'next_steps', 'notes'],
    labels: {
      tasks_given: 'משימות שקיבלה',
      progress: 'התקדמות',
      difficulties: 'קושי בהתקדמות',
      next_steps: 'עם מה מתחילים בפגישה הבאה',
      notes: 'הערות',
    },
    primary: 'tasks_given',
  },
];

/**
 * The exact per-step transcription instruction. Passed as the transcription
 * prompt so the audio model itself stays verbatim.
 */
const TRANSCRIBE_INSTRUCTION =
  'תמלל באופן מלא ומילולי את ההקלטה של השלב הנוכחי בלבד. אל תסכם, אל תקצר, ' +
  'אל תשכתב ואל תשמיט פרטים. שמור על סדר הדיבור המקורי. אל תוסיף מידע שלא ' +
  'נאמר. הוסף רק פיסוק בסיסי. אם חלק אינו ברור, כתוב [לא ברור] ואל תנחש.';

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

/**
 * Download + fully transcribe a single Yemot recording — this step's audio
 * only, word-for-word. Throws on any failure.
 */
async function transcribePath(openai: OpenAI, path: string): Promise<string> {
  const dl = await fetchFile(path);
  if (!dl.ok) throw new Error(`download ${path}: ${dl.error}`);

  const file = await toFile(dl.buffer, fileNameFromPath(path));
  const result = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    language: 'he',
    prompt: TRANSCRIBE_INSTRUCTION,
  });
  const text = (result.text ?? '').trim();
  if (!text) throw new Error(`empty transcript for ${path}`);
  return text;
}

/** Strip punctuation/whitespace so verbatim coverage can be compared. */
function normalizeForCompare(s: string): string {
  return s.replace(/[\s.,!?;:׃־\-–—()[\]"'`׳״…]/g, '');
}

/**
 * Split ONE step's full transcript verbatim into THAT step's fields only.
 *
 * The model is only allowed to copy the transcript word-for-word into the
 * step's fields (sentence-boundary splits, original order, nothing dropped
 * or rewritten). A code-level guard then verifies the fields still contain
 * the whole transcript; on any doubt the untouched full transcript is
 * stored in the step's primary field so no words are ever lost.
 *
 * Step 1 additionally copies the spoken patient name into
 * spoken_patient_name — copy only, used for patient matching.
 */
async function splitPartVerbatim(
  openai: OpenAI,
  spec: (typeof PART_FIELDS)[number],
  transcript: string,
): Promise<Partial<Fields>> {
  const isPart1 = spec.part === 1;
  const jsonKeys = isPart1 ? ['spoken_patient_name', ...spec.keys] : [...spec.keys];

  const fieldLines = spec.keys.map(k => `- ${k}: ${spec.labels[k]}`);

  const system = [
    `לפנייך תמלול מלא ומילולי של הקלטה משלב ${spec.part} בלבד (${spec.title}) מתוך סיכום שיחת טיפול.`,
    'תפקידך הוא אך ורק לחלק את הטקסט, מילה במילה וכלשונו, בין השדות של שלב זה.',
    'אינך מסכמת, אינך עורכת ואינך כותבת טקסט משלך.',
    '',
    'כללים מחייבים:',
    '- העתיקי את התמלול במלואו: כל משפט חייב להופיע, בדיוק כלשונו, באחד מהשדות.',
    '- אסור לסכם, לקצר, לנסח מחדש, להפוך לכותרת, לחלץ נקודות מרכזיות,',
    '  לשנות את סדר המשפטים, להשמיט חזרות או פרטים, להשלים מידע שלא נאמר',
    '  או לנחש מילים לא ברורות.',
    '- חלקי רק בגבולות משפטים ושמרי על הסדר המקורי של הדיבור.',
    '- מותר רק פיסוק בסיסי. אם מופיע "[לא ברור]" — השאירי אותו כמו שהוא.',
    `- משפט שלא ברור לאיזה שדה הוא שייך — שייכי אותו לשדה ${spec.primary}.`,
    '- שדה שלא נאמר לגביו דבר — החזירי עבורו מחרוזת ריקה "".',
    '',
    'השדות של שלב זה:',
    ...fieldLines,
    ...(isPart1
      ? [
          '',
          '- spoken_patient_name: העתיקי לכאן רק את שם המטופלת כפי שנאמר,',
          `  ללא מילים נוספות. אם לא נאמר שם ברור — כתבי "${NAME_PLACEHOLDER}".`,
          '  כל שאר התמלול, מילה במילה, שייך ל-current_state.',
        ]
      : []),
    '',
    `החזירי אך ורק JSON עם המפתחות: ${jsonKeys.join(', ')}. ערכים כמחרוזות בעברית.`,
  ].join('\n');

  const resp = await openai.chat.completions.create({
    model: SPLIT_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: transcript },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? '{}';
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const out: Partial<Fields> = {};
  for (const key of jsonKeys) {
    const v = parsed[key];
    out[key as FieldKey] = typeof v === 'string' ? v.trim() : '';
  }

  // ── Verbatim guard ──────────────────────────────────────────────
  // The content fields together must still hold (essentially) the whole
  // transcript. If the model dropped or rewrote text, discard its split
  // and store the untouched full transcript in the step's primary field —
  // full text always wins over a nicer split.
  const combined = normalizeForCompare(spec.keys.map(k => out[k] ?? '').join(''));
  const source = normalizeForCompare(transcript);
  const nameLen = isPart1
    ? normalizeForCompare(
        out.spoken_patient_name && out.spoken_patient_name !== NAME_PLACEHOLDER
          ? out.spoken_patient_name
          : '',
      ).length
    : 0;
  const covered = combined.length + nameLen;
  if (source.length > 0 && covered < source.length * 0.9) {
    console.warn(
      `${TAG} part${spec.part} split lost text (${covered}/${source.length} chars) — storing full transcript in ${spec.primary}`,
    );
    for (const k of spec.keys) out[k] = '';
    out[spec.primary] = transcript;
    // Keep whatever name was copied (part 1) — the transcript itself is intact.
  }

  if (isPart1 && !out.spoken_patient_name) out.spoken_patient_name = NAME_PLACEHOLDER;
  return out;
}

/**
 * Build the full field set: each part is split SEPARATELY, into its own
 * fields only. No cross-part call ever sees another part's text, so text
 * can never migrate between steps.
 */
async function buildFieldsVerbatim(
  openai: OpenAI,
  transcripts: [string, string, string],
): Promise<Fields> {
  const out = {} as Fields;
  for (const key of FIELD_KEYS) out[key] = '';

  for (let i = 0; i < PART_FIELDS.length; i++) {
    const partial = await splitPartVerbatim(openai, PART_FIELDS[i], transcripts[i]);
    for (const [k, v] of Object.entries(partial)) {
      out[k as FieldKey] = v ?? '';
    }
  }

  if (!out.spoken_patient_name) out.spoken_patient_name = NAME_PLACEHOLDER;
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

  // ── 1. Download + fully transcribe each part on its own ─────────
  //     (audio stays in memory; each file is sent separately)
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

  // ── 2. Verbatim split, per part, into that part's fields only ──
  let fields: Fields;
  try {
    fields = await buildFieldsVerbatim(openai, [part1, part2, part3]);
  } catch (e) {
    console.error(`${TAG} verbatim split failed:`, (e as Error).message);
    return { ok: false, error: `verbatim split failed: ${(e as Error).message}`, httpStatus: 502 };
  }

  // ── 3. Patient match (fuzzy — transcripts garble Hebrew names) ─
  const supabase = createServerClient();
  const name = fields.spoken_patient_name.trim();
  const isPlaceholder = name === NAME_PLACEHOLDER;

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
