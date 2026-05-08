/**
 * POST /api/assistant/query
 *
 * Body: { question: string }
 * Auth: Bearer token of an active authorized user (admin OR staff).
 *
 * READ-ONLY CONTRACT
 * ──────────────────
 * The assistant CAN ONLY run tools registered in lib/assistant/dispatch.ts,
 * which CAN ONLY call SELECT functions in lib/assistant/tools.ts. There is
 * no write path. There is no "general" SQL endpoint. There is no "do
 * anything" fallback. If the parser cannot classify the question, the help
 * payload is returned — the model never improvises against the database.
 *
 * Adding a write capability later requires:
 *   1. A separate dispatcher (`dispatchWriteTool`) with its own auth scope.
 *   2. A double-confirm UX in the drawer.
 *   3. A per-deployment env flag, opt-in.
 *
 * PIPELINE TODAY
 * ──────────────
 *   question → parseQuestion (Hebrew NL → intent + range + name)
 *            → INTENT_TO_TOOL → dispatchTool(name, input)
 *            → tools.getXxx() (SELECT)
 *            → { answer, links, rows } back to drawer
 *
 * PIPELINE — FUTURE AI MODE (not wired)
 * ─────────────────────────────────────
 * The same dispatchTool() is also what a Claude tool-use loop will call.
 * Wiring it up means:
 *   1. Add ANTHROPIC_API_KEY to env.
 *   2. Replace the parser branch below with a call to anthropic.messages.create
 *      passing tools=TOOL_SCHEMAS (already defined in lib/assistant/toolSchemas.ts).
 *   3. For each tool_use block in the response, call dispatchTool(name, input)
 *      and feed the result back as tool_result.
 *   4. Keep the parser branch as a cheap offline fallback when the API key
 *      is absent or rate-limited.
 * No change to dispatch.ts or tools.ts is required to flip the switch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { parseQuestion } from '@/lib/assistant/parser';
import { dispatchTool, INTENT_TO_TOOL } from '@/lib/assistant/dispatch';
import { EXAMPLE_QUESTIONS } from '@/lib/assistant/tools';

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question: string = (body?.question ?? '').trim();
  if (!question)               return NextResponse.json({ error: 'שאלה חסרה' },     { status: 400 });
  if (question.length > 500)   return NextResponse.json({ error: 'השאלה ארוכה מדי' }, { status: 400 });

  const parsed   = parseQuestion(question);
  const toolName = INTENT_TO_TOOL[parsed.intent];

  // Server-side debug — we want to see in logs what the parser decided
  // and which candidates it considered. Useful when iterating on phrasing.
  console.log('[assistant]', JSON.stringify({
    q:      question,
    intent: parsed.intent,
    range:  parsed.range?.label ?? null,
    name:   parsed.name ?? null,
    debug:  parsed.debug ?? [],
  }));

  const supabase = createServerClient();

  // Intent the parser couldn't classify — return help, never invoke a tool.
  if (!toolName) {
    return NextResponse.json({
      intent: 'unknown',
      answer: 'לא הצלחתי להבין את השאלה. הנה כמה דוגמאות שעובדות:',
      links:  [],
      rows:   EXAMPLE_QUESTIONS.map(q => ({ title: q })),
    });
  }

  // Translate parser output → tool input (typed shape per tool).
  const input: Record<string, unknown> = {};
  if (parsed.range) {
    input.start = parsed.range.start;
    input.end   = parsed.range.end;
    input.label = parsed.range.label;
  }
  if (parsed.name) {
    input.name = parsed.name;
  }

  try {
    const result = await dispatchTool(supabase, toolName, input);
    return NextResponse.json({
      intent: parsed.intent,
      tool:   toolName,
      answer: result.answer,
      links:  result.links ?? [],
      rows:   result.rows  ?? [],
    });
  } catch (e) {
    console.error('[assistant/query] tool failed:', e);
    return NextResponse.json(
      { error: 'שגיאה בעיבוד השאלה. נסי לנסח שוב.' },
      { status: 500 },
    );
  }
}
