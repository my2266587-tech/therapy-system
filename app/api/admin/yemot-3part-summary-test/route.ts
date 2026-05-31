/**
 * POST /api/admin/yemot-3part-summary-test
 *   Body: {
 *     "part1_path": "ivr2:/2/002.wav",   // patient name + current state
 *     "part2_path": "ivr2:/2/003.wav",   // topics raised + what we did
 *     "part3_path": "ivr2:/2/004.wav"    // tasks/progress/difficulty/next/notes
 *   }
 *
 *   V1 probe for the guided 3-recording flow: the clinician records three
 *   short clips (instead of one long one), each covering a known group of
 *   fields. We download each clip to memory, transcribe it, then ask the
 *   model to split the three transcripts into the structured
 *   phone_summary_drafts fields BY POSITION (no guessing which clip is
 *   which). One draft is created.
 *
 *   Audio handling matches the other probes: fetched into a Buffer, sent to
 *   the transcription API, never written to disk / Supabase, never returned.
 *   The Yemot files are left in place (deletion is a later step).
 *
 * Auth (any one passes — same as yemot-transcribe-test):
 *   - Bearer token of an active authorized user
 *   - Bearer CRON_SECRET
 *   - ?secret= / body secret matching YEMOT_WEBHOOK_SECRET
 *
 * Path safety: every path must start with `ivr2:/`.
 *
 * Response (success):
 *   { ok, draft_id, status, match_status,
 *     parts: { part1_chars, part2_chars, part3_chars }, call_date }
 * Response (failure): { ok:false, error } — no draft, no stored audio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { fetchFile, isValidYemotPath, YEMOT_PATH_PREFIX } from '@/lib/yemot';
import { createServerClient } from '@/lib/supabaseServer';
import OpenAI, { toFile } from 'openai';

export const maxDuration = 120;

// Cheap, Hebrew-capable transcription model (same as the single-part probe).
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

/* ── Auth (identical contract to the other probe routes) ─────────── */

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function hasValidWebhookSecret(req: NextRequest, bodySecret: string | null): boolean {
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) return false;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return bodySecret != null && bodySecret === expected;
}

async function authorize(req: NextRequest, bodySecret: string | null): Promise<boolean> {
  if (isCron(req)) return true;
  if (hasValidWebhookSecret(req, bodySecret)) return true;
  const user = await getAuthorizedUser(req);
  return Boolean(user);
}

/* ── Helpers ─────────────────────────────────────────────────────── */

interface Body {
  part1_path?: string;
  part2_path?: string;
  part3_path?: string;
  secret?: string;
}

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

  // Normalise: every key present as a trimmed string.
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

/* ── Handler ─────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Empty body is fine if the secret is in the query string.
  }

  if (!(await authorize(req, body.secret ?? null))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const paths = [body.part1_path, body.part2_path, body.part3_path].map((p) => (p ?? '').trim());
  const labels = ['part1_path', 'part2_path', 'part3_path'];
  for (let i = 0; i < paths.length; i++) {
    if (!paths[i]) {
      return NextResponse.json(
        { ok: false, error: `${labels[i]} is required (must start with ${YEMOT_PATH_PREFIX})` },
        { status: 400 },
      );
    }
    if (!isValidYemotPath(paths[i])) {
      return NextResponse.json(
        { ok: false, error: `${labels[i]} must be a Yemot file path starting with ${YEMOT_PATH_PREFIX}` },
        { status: 400 },
      );
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const openai = new OpenAI();

  // ── 1. Download + transcribe each part (audio stays in memory) ──
  let transcripts: [string, string, string];
  try {
    // Sequential keeps memory low — only one audio buffer alive at a time.
    const t1 = await transcribePath(openai, paths[0]);
    const t2 = await transcribePath(openai, paths[1]);
    const t3 = await transcribePath(openai, paths[2]);
    transcripts = [t1, t2, t3];
  } catch (e) {
    console.error(`${TAG} transcription failed:`, (e as Error).message);
    return NextResponse.json(
      { ok: false, error: `transcription failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
  const [part1, part2, part3] = transcripts;

  // ── 2. Structure into fields by position ───────────────────────
  let fields: Fields;
  try {
    fields = await structureFields(openai, part1, part2, part3);
  } catch (e) {
    console.error(`${TAG} structuring failed:`, (e as Error).message);
    return NextResponse.json(
      { ok: false, error: `structuring failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  // ── 3. Patient match (same ILIKE rule as the other routes) ─────
  const supabase = createServerClient();
  const name = fields.spoken_patient_name.trim();
  const isPlaceholder = name === 'צריך שיוך מטופלת';

  let matched_patient_id: string | null = null;
  let match_status: 'matched' | 'ambiguous' | 'not_found' = 'not_found';
  let status: 'draft_ready' | 'needs_match' = 'needs_match';

  if (name && !isPlaceholder) {
    const { data: candidates, error: lookupErr } = await supabase
      .from('patients')
      .select('id, full_name')
      .ilike('full_name', `%${name}%`)
      .limit(5);
    if (lookupErr) {
      console.error(`${TAG} patient lookup failed:`, lookupErr.message);
      return NextResponse.json({ ok: false, error: `patient lookup: ${lookupErr.message}` }, { status: 500 });
    }
    const list = candidates ?? [];
    if (list.length === 1) {
      matched_patient_id = list[0].id;
      match_status = 'matched';
      status = 'draft_ready';
    } else if (list.length > 1) {
      match_status = 'ambiguous';
    } // else stays not_found / needs_match
  }

  // ── 4. Create one draft ────────────────────────────────────────
  const call_date = israelToday();
  const emptyToNull = (s: string): string | null => (s.length > 0 ? s : null);

  const { data, error: insErr } = await supabase
    .from('phone_summary_drafts')
    .insert({
      spoken_patient_name: name || null,
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
    return NextResponse.json({ ok: false, error: `draft creation failed: ${insErr.message}` }, { status: 500 });
  }

  console.log(`${TAG} draft created: id=${data.id} status=${status} match=${match_status}`);

  return NextResponse.json({
    ok:           true,
    draft_id:     data.id,
    status,
    match_status,
    parts: {
      part1_chars: part1.length,
      part2_chars: part2.length,
      part3_chars: part3.length,
    },
    call_date,
  });
}
