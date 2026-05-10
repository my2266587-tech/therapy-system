/**
 * POST /api/recordings/[id]/structure-summary
 *
 *   Reads recordings.transcript_text, asks an LLM to split it into the
 *   structured fields of a session_summary, and writes the result to
 *   recordings.ai_summary_raw. Idempotent — running it again overwrites
 *   the previous AI output (useful when the first attempt was poor).
 *
 *   This step does NOT create a session_summaries row. The clinician
 *   still has to click "צור סיכום פגישה ←" on the recording, which
 *   goes through /api/recordings/[id]/create-summary and uses the
 *   ai_summary_raw written here.
 *
 *   Model: gpt-4o-mini in JSON mode. Hebrew transcripts in, Hebrew
 *   field values out.
 *
 * Env: OPENAI_API_KEY (required).
 * Auth: Bearer token of an active authorized user.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

/** Vercel timeout — gpt-4o-mini for a 5–10 min transcript is usually
 *  under 15s, but allow plenty of headroom for long sessions. */
export const maxDuration = 120;

const MODEL = 'gpt-4o-mini';

/** The exact set of fields we ask the model to populate. Keeping this
 *  list canonical here so we can validate the response without surprises.
 *  Order mirrors the order they appear in the SummaryDetailCard. */
const SUMMARY_FIELDS = [
  'main_topics',
  'treatment_actions',
  'current_state',
  'next_steps',
  'tasks_given',
  'progress',
  'difficulties',
  'notes',
] as const;

type SummaryField = (typeof SUMMARY_FIELDS)[number];

const SYSTEM_PROMPT =
  'את עוזרת קלינית מנוסה. תפקידך לקרוא תמלול של פגישה טיפולית בעברית ' +
  'ולפצל אותו לסעיפים מובנים של סיכום פגישה. החזירי תמיד JSON תקין ' +
  'במבנה שיוגדר בהודעת המשתמשת. אל תמציאי מידע שלא נמצא בתמלול. ' +
  'אם נושא לא דובר עליו — החזירי מחרוזת ריקה לאותו שדה.';

function buildUserPrompt(transcript: string): string {
  return [
    'התמלול שלהלן הוא של פגישה טיפולית. הפיקי ממנו JSON עם השדות הבאים:',
    '',
    '- main_topics — הנושאים העיקריים שעלו בפגישה',
    '- treatment_actions — הפעולות הטיפוליות שבוצעו במהלך הפגישה',
    '- current_state — תיאור מצבה הנוכחי של המטופלת',
    '- next_steps — צעדים מתוכננים לפגישה הבאה / להמשך הטיפול',
    '- tasks_given — משימות שהמטופלת קיבלה לבית',
    '- progress — התקדמות שנצפתה ביחס לטיפולים קודמים',
    '- difficulties — קשיים, התנגדויות או נקודות תקיעה',
    '- notes — הערות חופשיות שלא משויכות לאחת הקטגוריות',
    '',
    'חוקים:',
    '- כל שדה הוא מחרוזת בעברית.',
    '- אם אין מידע על שדה — החזירי מחרוזת ריקה "".',
    '- אל תמציאי מידע שלא נמצא בתמלול.',
    '- אל תוסיפי שדות שאינם ברשימה.',
    '- אורך כל שדה: עד 1500 תווים, פסקאות מופרדות בשורה חדשה.',
    '',
    'התמלול:',
    '"""',
    transcript,
    '"""',
  ].join('\n');
}

/* ── Validation of the model's response ──────────────────────────── */

function pickSummaryFields(obj: unknown): Record<SummaryField, string> {
  if (!obj || typeof obj !== 'object') {
    throw new Error('המודל לא החזיר אובייקט JSON');
  }
  const src = obj as Record<string, unknown>;
  const out = {} as Record<SummaryField, string>;
  for (const key of SUMMARY_FIELDS) {
    const v = src[key];
    if (v == null)              out[key] = '';
    else if (typeof v === 'string') out[key] = v.trim();
    else                            out[key] = String(v);
  }
  // The response must contain at least ONE non-empty field; otherwise
  // we suspect the model failed to parse the transcript.
  const anyContent = SUMMARY_FIELDS.some(k => out[k].length > 0);
  if (!anyContent) {
    throw new Error('המודל החזיר תוצאה ריקה — נסי שוב');
  }
  return out;
}

/* ── Route handler ──────────────────────────────────────────────── */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY לא מוגדר בשרת — לא ניתן לסדר לסיכום AI.' },
      { status: 503 },
    );
  }

  const { id: recordingId } = await params;
  const supabase = createServerClient();

  /* 1. Load + validate */
  const { data: rec, error: recErr } = await supabase
    .from('recordings')
    .select('id, transcript_text, processing_status')
    .eq('id', recordingId)
    .maybeSingle();

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (!rec)   return NextResponse.json({ error: 'הקלטה לא נמצאה' }, { status: 404 });

  const transcript = (rec.transcript_text ?? '').trim();
  if (!transcript) {
    return NextResponse.json(
      { error: 'אין תמלול להקלטה זו. הריצי קודם תמלול.' },
      { status: 400 },
    );
  }
  if (rec.processing_status === 'summarizing') {
    return NextResponse.json(
      { error: 'עיבוד AI בעיצומו — נסי שוב בעוד רגע' },
      { status: 409 },
    );
  }

  /* 2. Lock the row */
  await supabase.from('recordings').update({
    processing_status: 'summarizing',
    processing_error:  null,
  }).eq('id', recordingId);

  /* 3. Call OpenAI in JSON mode */
  let parsed: Record<SummaryField, string>;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model:           MODEL,
      response_format: { type: 'json_object' },
      temperature:     0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(transcript) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    if (!raw.trim()) throw new Error('המודל החזיר תגובה ריקה');

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error('המודל החזיר תגובה שאינה JSON תקין');
    }
    parsed = pickSummaryFields(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[recordings structure-summary] failed:', msg);
    await supabase.from('recordings').update({
      processing_status: 'failed',
      processing_error:  `AI: ${msg}`,
    }).eq('id', recordingId);
    return NextResponse.json({ error: `שגיאת AI: ${msg}` }, { status: 500 });
  }

  /* 4. Save success */
  const { error: saveErr } = await supabase
    .from('recordings')
    .update({
      ai_summary_raw:    parsed,
      processing_status: 'completed',
      processing_error:  null,
    })
    .eq('id', recordingId);

  if (saveErr) {
    await supabase.from('recordings').update({
      processing_status: 'failed',
      processing_error:  `DB: ${saveErr.message}`,
    }).eq('id', recordingId);
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:             true,
    recording_id:   recordingId,
    ai_summary_raw: parsed,
    field_count:    SUMMARY_FIELDS.filter(k => parsed[k].length > 0).length,
  });
}
