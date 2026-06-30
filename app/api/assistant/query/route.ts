/**
 * POST /api/assistant/query
 *
 * Body: {
 *   question: string,
 *   history?: { role: 'user' | 'assistant'; text: string }[],  // last few turns
 *   context?: { lastPatient?: { id: string; name: string } },  // active focus
 * }
 * Auth: Bearer token of an active authorized user (admin OR staff).
 *
 * READ-ONLY CONTRACT
 * ──────────────────
 * The assistant CAN ONLY run tools registered in lib/assistant/dispatch.ts,
 * which CAN ONLY call SELECT functions in lib/assistant/tools.ts. There is
 * no write path. There is no "general" SQL endpoint. The model has NO
 * database access — it only chooses which registered tool to call.
 *
 * Adding a write capability later requires:
 *   1. A separate dispatcher (`dispatchWriteTool`) with its own auth scope.
 *   2. A double-confirm UX in the drawer.
 *   3. A per-deployment env flag, opt-in.
 *
 * PIPELINE
 * ────────
 *   question + history + context
 *     → runAssistantAi (OpenAI tool-use; the model picks a tool)
 *         ↳ null on any failure (no API key, network, malformed call)
 *     → parseQuestion (Hebrew NL heuristic — offline fallback)
 *     → dispatchTool(name, input)  ← single SELECT-only gate
 *     → tools.getXxx() (SELECT)
 *     → { answer, links, rows, action?, patient_focus? } back to drawer
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { parseQuestion } from '@/lib/assistant/parser';
import { dispatchTool, INTENT_TO_TOOL } from '@/lib/assistant/dispatch';
import { EXAMPLE_QUESTIONS } from '@/lib/assistant/tools';
import { runAssistantAi, type ConversationTurn, type AssistantContext } from '@/lib/assistant/ai';
import type { ToolResult } from '@/lib/assistant/tools';

/** Project the dispatcher's ToolResult onto the wire shape. */
function toResponse(intent: string, tool: string, result: ToolResult) {
  return {
    intent,
    tool,
    answer:        result.answer,
    links:         result.links ?? [],
    rows:          result.rows  ?? [],
    action:        result.action ?? null,
    patient_focus: result.patient_focus ?? null,
  };
}

function parseHistory(raw: unknown): ConversationTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ConversationTurn[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const role = (t as { role?: unknown }).role;
    const text = (t as { text?: unknown }).text;
    if ((role === 'user' || role === 'assistant') && typeof text === 'string' && text.trim()) {
      out.push({ role, text });
    }
  }
  return out;
}

function parseContext(raw: unknown): AssistantContext {
  if (!raw || typeof raw !== 'object') return {};
  const lp = (raw as { lastPatient?: unknown }).lastPatient;
  if (!lp || typeof lp !== 'object') return {};
  const id   = (lp as { id?: unknown }).id;
  const name = (lp as { name?: unknown }).name;
  if (typeof id === 'string' && typeof name === 'string' && id && name) {
    return { lastPatient: { id, name } };
  }
  return {};
}

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question: string = (body?.question ?? '').trim();
  if (!question)               return NextResponse.json({ error: 'שאלה חסרה' },     { status: 400 });
  if (question.length > 500)   return NextResponse.json({ error: 'השאלה ארוכה מדי' }, { status: 400 });

  const history = parseHistory(body?.history);
  const context = parseContext(body?.context);
  const supabase = createServerClient();

  // ── AI mode (primary path) ─────────────────────────────────────────
  // The model only picks a tool name + arguments; the actual data access
  // still goes through dispatchTool(). null = any failure → fall through
  // to the heuristic parser below.
  try {
    const ai = await runAssistantAi(supabase, question, { history, context });
    if (ai) {
      console.log('[assistant]', JSON.stringify({
        q: question, mode: 'ai', tool: ai.tool,
        focus: context.lastPatient?.name ?? null,
        action: ai.result.action?.type ?? null,
      }));
      return NextResponse.json(toResponse('ai', ai.tool, ai.result));
    }
  } catch (e) {
    console.warn('[assistant/query] AI tool dispatch failed, falling back:', e);
  }

  // ── Parser fallback ────────────────────────────────────────────────
  // The parser doesn't yet understand cross-turn context, so seed the
  // question with the focused patient's name if the user didn't repeat
  // it. Cheap: append " של <name>" only when no name was extracted from
  // the bare question.
  const bareParsed = parseQuestion(question);
  let resolved = bareParsed;
  if (!bareParsed.name && context.lastPatient) {
    resolved = parseQuestion(`${question} של ${context.lastPatient.name}`);
  }
  const toolName = INTENT_TO_TOOL[resolved.intent];

  console.log('[assistant]', JSON.stringify({
    q:      question,
    mode:   'parser',
    intent: resolved.intent,
    range:  resolved.range?.label ?? null,
    name:   resolved.name ?? null,
    focus:  context.lastPatient?.name ?? null,
    debug:  resolved.debug ?? [],
  }));

  // Intent the parser couldn't classify — return help, never invoke a tool.
  if (!toolName) {
    return NextResponse.json({
      intent: 'unknown',
      answer: 'לא הצלחתי להבין את השאלה. הנה כמה דוגמאות שעובדות:',
      links:  [],
      rows:   EXAMPLE_QUESTIONS.map(q => ({ title: q })),
      action: null,
      patient_focus: null,
    });
  }

  // Translate parser output → tool input (typed shape per tool).
  const input: Record<string, unknown> = {};
  if (resolved.range) {
    input.start = resolved.range.start;
    input.end   = resolved.range.end;
    input.label = resolved.range.label;
  }
  if (resolved.name) {
    input.name = resolved.name;
  }
  if (resolved.topic) {
    input.topic = resolved.topic;
  }

  try {
    const result = await dispatchTool(supabase, toolName, input);
    return NextResponse.json(toResponse(resolved.intent, toolName, result));
  } catch (e) {
    console.error('[assistant/query] tool failed:', e);
    return NextResponse.json(
      { error: 'שגיאה בעיבוד השאלה. נסי לנסח שוב.' },
      { status: 500 },
    );
  }
}
