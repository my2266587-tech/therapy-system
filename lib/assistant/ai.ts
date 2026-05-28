/**
 * AI mode for the internal assistant.
 *
 * The model NEVER touches the database. It only chooses which registered
 * tool to call and with what arguments. The actual data access happens in
 * dispatchTool() — the same gate the heuristic parser already uses.
 *
 * Contract:
 *   - One model call. tool_choice: 'required' forces a tool pick.
 *   - Exactly one tool_use is honored — we don't loop. The tool result IS
 *     the user-facing answer (rendered by the drawer), so we don't ask the
 *     model to compose natural language afterwards.
 *   - We pass recent conversation history + a "current patient focus" so
 *     follow-up questions ("יש לה מסמכים?") work without the user
 *     repeating the name.
 *   - Any failure (no API key, network, malformed call) → return null.
 *     The caller falls back to the heuristic parser.
 *
 * Why OpenAI and not Anthropic: openai is already a dependency in
 * the project. Tool schemas are translated to OpenAI's function shape
 * inline below.
 */

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TOOL_SCHEMAS } from './toolSchemas';
import { dispatchTool, isKnownTool } from './dispatch';
import type { ToolResult } from './tools';

const MODEL = 'gpt-4o-mini';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantContext {
  /** The patient the previous turns were about — used to resolve "she/her". */
  lastPatient?: { id: string; name: string };
}

/**
 * System prompt for the read-only internal assistant.
 *
 * The hard rules are in English (less ambiguity for the model around tool
 * names). The Hebrew opener sets persona and language. The model is told
 * exactly when to use each tool, with emphasis on NOT defaulting to the
 * activity-summary tool when a more specific one fits.
 *
 * {{TODAY}} is replaced at call time with the server's date.
 * {{FOCUS}} is replaced with the active patient (or "(אין)").
 */
export const ASSISTANT_SYSTEM_PROMPT = [
  'את עוזרת קלינית פנימית של מערכת ניהול קליניקה טיפולית בעברית.',
  'את עונה אך ורק על שאלות הקשורות למטופלות, פגישות, סיכומים, תשלומים,',
  'מסמכים, וצוות מטפל.',
  '',
  'You are read-only. You have no database access. The only way to answer',
  'is to call exactly ONE of the registered tools. The tool result already',
  'contains the user-facing Hebrew answer — do NOT compose your own prose.',
  '',
  'Tool selection — answer the SPECIFIC question. Do not default to an',
  'activity summary when a more focused tool fits.',
  '',
  '  - "מי אחראי על X?" / "מי המטפלת של X?" / "מי הרכזת של X?"',
  '      → getPatientResponsibleStaff   (NOT getPatientTimeline)',
  '  - "מה היה בפגישה האחרונה של X?" / "סיכום אחרון של X" / "מה דיברו על"',
  '      → getLatestSessionSummary      (NOT getPatientTimeline)',
  '  - "ספרי לי על X" / "מה המצב של X?" / "סקירה על X"',
  '      → getPatientOverview           (NOT getPatientTimeline)',
  '  - "פתח כרטיס של X" / "תפתח את X" / "הכנס לכרטיס של X"',
  '      → openPatient                  (this performs real navigation)',
  '  - "כמה פגישות הייתה ל-X?" / "כמה סיכומים יש ל-X?"',
  '      → getPatientTimeline           (this is the counter-heavy tool)',
  '  - "אילו מסמכים יש ל-X?" → getPatientDocuments',
  '  - General dashboard questions (היום / השבוע / פתוחים / חסרים) → the',
  '    matching dashboard tool.',
  '',
  'Follow-up questions: if the user refers to "she / her / the patient /',
  'אותה / שלה / לה" without naming someone, use the active focus patient',
  'below as the name argument. Do NOT call openPatient just because there',
  'is a focus patient — only call it when the user explicitly asks to open.',
  '',
  'General rules:',
  '- Always pick exactly one tool. Never zero, never multiple.',
  '- Convert Hebrew date phrases to absolute YYYY-MM-DD using today below.',
  '  היום → today; מחר → today+1; אתמול → today-1; השבוע → Sun..Sat.',
  '- Patient names are Hebrew strings; pass them as-is (no transliteration).',
  '- Never invent fields not listed in a tool schema, never invent names.',
  '- Use "help" ONLY when the user explicitly asks for examples / "עזרה".',
  '  Never use it as a fallback.',
  '',
  'Today: {{TODAY}} (Asia/Jerusalem).',
  'Active patient focus: {{FOCUS}}',
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
  opts: {
    history?: ConversationTurn[];
    context?: AssistantContext;
  } = {},
): Promise<AiAnswer | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  // Translate Claude-style tool schemas (the canonical registry) into
  // OpenAI's function-tool shape. Same descriptions, same JSON Schema
  // for parameters — only the wrapping object differs.
  const tools = TOOL_SCHEMAS.map((s) => ({
    type: 'function' as const,
    function: {
      name:        s.name,
      description: s.description,
      parameters:  s.input_schema,
    },
  }));

  const today = new Date().toISOString().slice(0, 10);
  const focus = opts.context?.lastPatient
    ? `${opts.context.lastPatient.name} (id=${opts.context.lastPatient.id})`
    : '(אין)';
  const system = ASSISTANT_SYSTEM_PROMPT
    .replace('{{TODAY}}', today)
    .replace('{{FOCUS}}', focus);

  // History: cap to last 6 turns so the prompt stays small. Map text
  // verbatim — we don't try to replay tool_calls / tool_results because
  // the model's job each turn is to pick the right tool from scratch
  // given the new question + the focus hint.
  const historyMessages = (opts.history ?? [])
    .slice(-6)
    .map((t) => ({ role: t.role, content: t.text }));

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
        ...historyMessages,
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

  // If the tool needs a patient name and the model didn't pass one (it
  // assumed the focus is implicit), inject the focus name. Saves a turn
  // on follow-ups like "יש לה מסמכים?".
  if (
    !toolInput.name &&
    opts.context?.lastPatient &&
    [
      'openPatient',
      'getPatientResponsibleStaff',
      'getLatestSessionSummary',
      'getPatientOverview',
      'getPatientTimeline',
      'getPatientDocuments',
    ].includes(toolName)
  ) {
    toolInput.name = opts.context.lastPatient.name;
  }

  // Dispatch is the same SELECT-only gate the heuristic parser hits.
  // Errors here are genuine DB / tool errors — let them bubble so the
  // route turns them into a 500 (consistent with the parser path).
  const result = await dispatchTool(supabase, toolName, toolInput);
  return { tool: toolName, result };
}
