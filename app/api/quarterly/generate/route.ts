/**
 * POST /api/quarterly/generate
 *
 * Body: { patient_id: string, start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD' }
 * Auth: Bearer token of an active authorized user (admin OR staff).
 *
 * Generates an AI DRAFT of a quarterly summary for one patient, built ONLY
 * from her session summaries inside the given quarter range. Nothing is
 * written to the database here — the client shows the draft for editing and
 * approval, and only then inserts a quarterly_summaries row itself.
 *
 * Grounding contract: the model receives the session summaries verbatim and
 * is instructed to use only that material — no invented facts, names,
 * diagnoses or recommendations. If there are no summaries in range we return
 * 404 and no model call is made.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import type { SessionSummary } from '@/types';

const MODEL = 'gpt-4o-mini';

/** Same field labels the patient-card PDF uses for a session summary. */
const SUMMARY_FIELDS: [keyof SessionSummary, string][] = [
  ['current_state',     'מצב נוכחי'],
  ['main_topics',       'נושאים חשובים שעלו'],
  ['treatment_actions', 'מה עשינו בטיפול'],
  ['next_steps',        'עם מה מתחילים בפגישה הבאה'],
  ['tasks_given',       'משימות שקיבלה'],
  ['progress',          'התקדמות'],
  ['difficulties',      'קושי בהתקדמות'],
  ['notes',             'הערות'],
];

const SYSTEM_PROMPT = [
  'את מסייעת קלינית הכותבת טיוטת סיכום רבעוני בעברית עבור מטופלת, על בסיס סיכומי פגישות בלבד.',
  '',
  'חוקים מחייבים:',
  '- הסתמכי אך ורק על המידע שמופיע בסיכומי הפגישות המצורפים. אסור להמציא עובדות, אירועים, שמות, אבחנות, ציטוטים או המלצות שאינם מופיעים בהם במפורש.',
  '- אם מידע מסוים חסר — פשוט אל תתייחסי אליו. אין לכתוב הנחות, הערכות או השערות.',
  '- כתבי בלשון מקצועית, חמה ותמציתית (כ־150–350 מילים).',
  '- מבנה מומלץ, רק כאשר יש לו כיסוי בסיכומים: פתיחה קצרה (התקופה ומספר הפגישות), נושאים מרכזיים שעלו, התקדמות ושינויים, קשיים, והמשך מתוכנן.',
  '- אל תפתחי בכותרת עם שם המטופלת — השם כבר מופיע במערכת.',
  '- הפלט: טקסט רץ בעברית בלבד, ללא Markdown וללא רשימות ממוספרות.',
].join('\n');

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'מפתח AI אינו מוגדר במערכת' }, { status: 503 });
  }

  let body: { patient_id?: unknown; start_date?: unknown; end_date?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }
  const patientId = typeof body.patient_id === 'string' ? body.patient_id : '';
  const startDate = typeof body.start_date === 'string' ? body.start_date : '';
  const endDate   = typeof body.end_date   === 'string' ? body.end_date   : '';
  if (!patientId || !YMD.test(startDate) || !YMD.test(endDate) || startDate > endDate) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const supabase = createServerClient();

  const [{ data: patient }, { data: summaries, error: sumErr }] = await Promise.all([
    supabase.from('patients').select('full_name').eq('id', patientId).maybeSingle(),
    supabase
      .from('session_summaries')
      .select('date, start_time, current_state, main_topics, treatment_actions, next_steps, tasks_given, progress, difficulties, notes')
      .eq('patient_id', patientId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
  ]);

  if (sumErr) {
    console.error('[quarterly/generate] summaries query failed:', sumErr.message);
    return NextResponse.json({ error: 'שגיאה בשליפת סיכומי הפגישות' }, { status: 500 });
  }
  if (!patient) {
    return NextResponse.json({ error: 'מטופלת לא נמצאה' }, { status: 404 });
  }

  const rows = (summaries ?? []) as Partial<SessionSummary>[];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'לא נמצאו סיכומי פגישות למטופלת זו בטווח הרבעון שנבחר' },
      { status: 404 },
    );
  }

  // Verbatim source material — one block per session summary, only
  // fields that actually have content.
  const blocks = rows.map((s, i) => {
    const lines = [`— סיכום פגישה ${i + 1} (תאריך: ${s.date ?? ''}) —`];
    for (const [key, label] of SUMMARY_FIELDS) {
      const v = s[key];
      if (typeof v === 'string' && v.trim()) lines.push(`${label}: ${v.trim()}`);
    }
    return lines.join('\n');
  });

  const userContent = [
    `מטופלת: ${patient.full_name}`,
    `תקופת הרבעון: ${startDate} עד ${endDate}`,
    `מספר סיכומי פגישות בתקופה: ${rows.length}`,
    '',
    'סיכומי הפגישות (המקור היחיד המותר):',
    '',
    blocks.join('\n\n'),
  ].join('\n');

  try {
    const openai = new OpenAI();
    const resp = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
    });
    const draft = resp.choices[0]?.message?.content?.trim();
    if (!draft) {
      return NextResponse.json({ error: 'ה-AI לא החזיר טיוטה. נסי שוב.' }, { status: 502 });
    }
    return NextResponse.json({ draft, count: rows.length });
  } catch (e) {
    console.error('[quarterly/generate] model call failed:', e);
    return NextResponse.json({ error: 'שגיאה בייצור הטיוטה. נסי שוב.' }, { status: 502 });
  }
}
