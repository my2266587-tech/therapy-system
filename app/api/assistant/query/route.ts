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
 * anything" fallback. The model has NO database access — it only chooses
 * which registered tool to call.
 *
 * Adding a write capability later requires:
 *   1. A separate dispatcher (`dispatchWriteTool`) with its own auth scope.
 *   2. A double-confirm UX in the drawer.
 *   3. A per-deployment env flag, opt-in.
 *
 * PIPELINE
 * ────────
 *   question
 *     → runAssistantAi (OpenAI tool-use; the model picks a tool)
 *         ↳ null on any failure (no API key, network, malformed call)
 *     → parseQuestion (Hebrew NL heuristic — offline fallback)
 *     → dispatchTool(name, input)  ← single SELECT-only gate
 *     → tools.getXxx() (SELECT)
 *     → { answer, links, rows } back to drawer
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { parseQuestion } from '@/lib/assistant/parser';
import { dispatchTool, INTENT_TO_TOOL } from '@/lib/assistant/dispatch';
import { EXAMPLE_QUESTIONS } from '@/lib/assistant/tools';
import { runAssistantAi } from '@/lib/assistant/ai';

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question: string = (body?.question ?? '').trim();
  if (!question)               return NextResponse.json({ error: 'שאלה חסרה' },     { status: 400 });
  if (question.length > 500)   return NextResponse.json({ error: 'השאלה ארוכה מדי' }, { status: 400 });

  const supabase = createServerClient();

  // ── AI mode (primary path) ─────────────────────────────────────────
  // The model only picks a tool name + arguments; the actual data access
  // still goes through dispatchTool(). null = any failure → fall through
  // to the heuristic parser below.
  try {
    const ai = await runAssistantAi(supabase, question);
    if (ai) {
      console.log('[assistant]', JSON.stringify({
        q: question, mode: 'ai', tool: ai.tool,
      }));
      return NextResponse.json({
        intent: 'ai',
        tool:   ai.tool,
        answer: ai.result.answer,
        links:  ai.result.links ?? [],
        rows:   ai.result.rows  ?? [],
      });
    }
  } catch (e) {
    // dispatchTool() failed AFTER the model picked a tool — log and
    // fall through to the parser. The parser may classify the question
    // differently and succeed (or surface the same friendly error).
    console.warn('[assistant/query] AI tool dispatch failed, falling back:', e);
  }

  // ── Parser fallback ────────────────────────────────────────────────
  const parsed   = parseQuestion(question);
  const toolName = INTENT_TO_TOOL[parsed.intent];

  console.log('[assistant]', JSON.stringify({
    q:      question,
    mode:   'parser',
    intent: parsed.intent,
    range:  parsed.range?.label ?? null,
    name:   parsed.name ?? null,
    debug:  parsed.debug ?? [],
  }));

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
