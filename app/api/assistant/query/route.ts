/**
 * POST /api/assistant/query
 *
 * Body: { question: string }
 * Auth: Bearer token of an active authorized user (admin OR staff).
 *
 * Pipeline:
 *   1. Authorize.
 *   2. Parse the Hebrew question → intent + range + name.
 *   3. Route to a read-only tool.
 *   4. Return { answer, links?, rows?, intent }.
 *
 * Strict no-write contract: the assistant never inserts, updates, or deletes.
 * If the parser returns 'unknown' we ship the help payload — the model never
 * improvises against the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { parseQuestion, type Intent } from '@/lib/assistant/parser';
import {
  getSessionsByDate, getUpcomingSessions, getMissingSummaries,
  getOpenPayments, getUnprocessedRecordings, getPatientTimeline,
  getPatientDocuments, helpResult,
  EXAMPLE_QUESTIONS, type ToolResult,
} from '@/lib/assistant/tools';

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question: string = (body?.question ?? '').trim();
  if (!question) {
    return NextResponse.json({ error: 'שאלה חסרה' }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: 'השאלה ארוכה מדי' }, { status: 400 });
  }

  const parsed = parseQuestion(question);
  const supabase = createServerClient();

  let result: ToolResult;
  let intent: Intent = parsed.intent;

  try {
    switch (parsed.intent) {
      case 'sessionsByDate':
        result = parsed.range
          ? await getSessionsByDate(supabase, parsed.range)
          : await getUpcomingSessions(supabase);
        break;

      case 'upcomingSessions':
        result = await getUpcomingSessions(supabase);
        break;

      case 'missingSummaries':
        result = await getMissingSummaries(supabase);
        break;

      case 'openPayments':
        result = await getOpenPayments(supabase);
        break;

      case 'unprocessedRecordings':
        result = await getUnprocessedRecordings(supabase);
        break;

      case 'patientDocuments':
        result = parsed.name
          ? await getPatientDocuments(supabase, parsed.name)
          : { answer: 'לא ציינת שם של מטופלת. נסי: "אילו מסמכים יש למטופלת [שם]?"' };
        break;

      case 'patientTimeline':
        result = parsed.name
          ? await getPatientTimeline(supabase, parsed.name)
          : { answer: 'לא ציינת שם של מטופלת.' };
        break;

      case 'help':
        result = helpResult();
        break;

      case 'unknown':
      default:
        intent = 'unknown';
        result = {
          answer: 'לא הבנתי את השאלה. הנה דוגמאות לשאלות שאפשר לשאול:',
          rows: EXAMPLE_QUESTIONS.map(q => ({ title: q })),
        };
        break;
    }
  } catch (e) {
    console.error('[assistant/query] tool failed:', e);
    return NextResponse.json(
      { error: 'שגיאה בעיבוד השאלה. נסי לנסח שוב.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    intent,
    answer: result.answer,
    links:  result.links ?? [],
    rows:   result.rows  ?? [],
  });
}
