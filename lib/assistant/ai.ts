/**
 * AI mode for the internal assistant.
 *
 * The model NEVER touches the database. It only chooses which registered
 * tool to call and with what arguments. The actual data access happens in
 * dispatchTool() — the same gate the heuristic parser already uses.
 *
 * Contract:
 *   - One model call. tool_choice: 'required' forces a tool pick (or 'help').
 *   - Exactly one tool_use is honored — we don't loop. The tool result IS
 *     the user-facing answer (rendered by the drawer), so we don't ask the
 *     model to compose natural language afterwards.
 *   - Any failure (no API key, network, JSON, unknown tool) → return null.
 *     The caller falls back to the heuristic parser.
 *
 * Why OpenAI and not Anthropic: openai is already a dependency
 * (used by /api/recordings/[id]/structure-summary). Adding @anthropic-ai/sdk
 * just for this would be net new surface for no functional gain — the tool
 * schemas are translated to OpenAI's function shape inline below.
 */

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TOOL_SCHEMAS } from './toolSchemas';
import { dispatchTool, isKnownTool } from './dispatch';
import type { ToolResult } from './tools';

const MODEL = 'gpt-4o-mini';

/**
 * System prompt for the read-only internal assistant.
 *
 * Hebrew system because the user-facing assistant is Hebrew, but the
 * constraint section is in English — clearer for the model and avoids
 * accidental RTL/punctuation ambiguity around tool names.
 *
 * {{TODAY}} is replaced at call time with the server's date so that
 * relative phrases (היום / מחר / השבוע) can be resolved by the model
 * into YYYY-MM-DD bounds that the tool schemas require.
 */
export const ASSISTANT_SYSTEM_PROMPT = [
  'את עוזרת קלינית פנימית של מערכת ניהול קליניקה טיפולית בעברית.',
  'את עונה אך ורק על שאלות הקשורות למטופלות, פגישות, סיכומים, תשלומים,',
  'הקלטות ומסמכים שכבר נמצאים במערכת.',
  '',
  'You are read-only. You have no database access. The only way to answer',
  'is to call exactly ONE of the registered tools. The tool result already',
  'contains the user-facing Hebrew answer — do NOT compose your own prose.',
  '',
  'Rules:',
  '- Always pick exactly one tool. Never zero, never multiple.',
  '- Convert Hebrew date phrases to absolute YYYY-MM-DD using the date',
  '  given below as "today". Examples: היום → today; מחר → today+1;',
  '  אתמול → today-1; השבוע → Sunday..Saturday around today.',
  '- Patient names are Hebrew strings; pass them as-is (no transliteration).',
  '- If the question is about a specific patient by name and asks about',
  '  documents → getPatientDocuments. Any other patient-specific question',
  '  → getPatientTimeline.',
  '- If the question is generic ("כמה מטופלות יש?", "מי המטופלות?") →',
  '  getPatientList.',
  '- If the user explicitly asks for examples / "מה אפשר לשאול" / "עזרה" →',
  '  help. Otherwise do NOT use help as a fallback.',
  '- Do not invent fields not listed in a tool schema. Do not invent',
  '  patient names. If a tool needs a name and none was given, still call',
  '  the most likely tool with the empty/partial input — the dispatcher',
  '  returns a friendly Hebrew clarification.',
  '',
  'Today: {{TODAY}} (Asia/Jerusalem).',
].join('\n');

export interface AiAnswer {
  tool:   string;
  result: ToolResult;
}

/**
 * Run the AI path. Returns null on any failure — the caller is expected
 * to fall back to the heuristic parser. We deliberately do NOT throw,
 * because a network blip on the assistant must not 500 the drawer.
 */
export async function runAssistantAi(
  supabase: SupabaseClient,
  question: string,
): Promise<AiAnswer | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  // Translate Claude-style tool schemas (already declared in toolSchemas.ts
  // as the canonical registry) into OpenAI's function-tool shape. Same
  // descriptions, same JSON Schema for parameters — only the wrapping
  // object differs.
  const tools = TOOL_SCHEMAS.map((s) => ({
    type: 'function' as const,
    function: {
      name:        s.name,
      description: s.description,
      parameters:  s.input_schema,
    },
  }));

  const today = new Date().toISOString().slice(0, 10);
  const system = ASSISTANT_SYSTEM_PROMPT.replace('{{TODAY}}', today);

  let toolName:  string | null = null;
  let toolInput: Record<string, unknown> = {};

  try {
    const openai = new OpenAI();
    const resp = await openai.chat.completions.create({
      model:       MODEL,
      temperature: 0,
      tools,
      tool_choice: 'required',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: question },
      ],
    });

    const call = resp.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function') return null;

    toolName = call.function.name;
    if (!isKnownTool(toolName)) return null;

    const args = call.function.arguments;
    if (args) {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        toolInput = parsed as Record<string, unknown>;
      }
    }
  } catch (e) {
    console.warn('[assistant/ai] model call failed:', e);
    return null;
  }

  if (!toolName) return null;

  // Dispatch is the same SELECT-only gate the heuristic parser hits.
  // Errors here are genuine DB / tool errors — let them bubble so the
  // route turns them into a 500 (consistent with the parser path).
  const result = await dispatchTool(supabase, toolName, toolInput);
  return { tool: toolName, result };
}
