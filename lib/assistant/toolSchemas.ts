/**
 * Claude-compatible tool schemas for the assistant.
 *
 * STATUS: documentation-only. Nothing reads these yet. They sit here so the
 * future "AI mode" implementation can pass them straight to
 * `client.messages.create({ tools: TOOL_SCHEMAS, ... })` without any
 * additional translation layer.
 *
 * READ-ONLY CONTRACT:
 *   Every tool listed here is a SELECT-only operation against the database.
 *   When write tools are eventually added (e.g. markPaymentPaid,
 *   createSummary), they MUST:
 *     1. Live in a separate file (`writeTools.ts`) — never co-mingled here.
 *     2. Have a server-side guard requiring an explicit confirmation token.
 *     3. Be opted-into per-deployment via env var, never on by default.
 *   Until then, the dispatcher rejects any tool name not in this registry.
 *
 * FUTURE — AI MODE:
 *   The flow becomes:
 *      user question
 *        → Claude with tools=TOOL_SCHEMAS, system="You are a read-only
 *           Hebrew assistant for a therapy practice management system…"
 *        → Claude returns tool_use blocks with { name, input }
 *        → server calls dispatchTool(name, input) — the SAME dispatcher
 *           the heuristic parser already uses
 *        → tool_result block fed back to Claude for the natural-language reply
 *   The current heuristic parser stays as the offline fallback / cheap path.
 */

export interface ClaudeToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean';
      description?: string;
      enum?: string[];
      pattern?: string;
    }>;
    required?: string[];
  };
}

export const TOOL_SCHEMAS: ClaudeToolSchema[] = [
  {
    name: 'getSessionsByDate',
    description:
      'List therapy sessions in a specific date range. Use for any "what sessions are on/were on date X" question — היום, מחר, אתמול, ביום שני, השבוע, etc. Always pass YYYY-MM-DD bounds.',
    input_schema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Inclusive lower bound, YYYY-MM-DD', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end:   { type: 'string', description: 'Inclusive upper bound, YYYY-MM-DD', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        label: { type: 'string', description: 'Hebrew label for the range, e.g. "היום" or "ביום שני". Used in the response text.' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'getUpcomingSessions',
    description: 'List up to 10 planned sessions in the next 14 days. Use when the user asks "פגישות הקרובות" / "הפגישה הבאה" without a specific date.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getMissingSummaries',
    description: 'List completed sessions that do not yet have a written summary in session_summaries. Use for "למי חסר סיכום פגישה?" and similar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getOpenPayments',
    description: 'List Sirel payments that are still unpaid (is_paid = false), with the running total. Use for "תשלומים פתוחים" / "מי טרם שולם".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getPatientTimeline',
    description: 'Activity summary for one patient — last/next session, summary count, document count. Use whenever the user asks about a specific patient by name.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hebrew full name (or partial). Will be matched ILIKE against patients.full_name.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getPatientDocuments',
    description: 'List uploaded documents for a specific patient. Use for "אילו מסמכים יש למטופלת [שם]?".',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hebrew full name (or partial). Matched ILIKE.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getPatientList',
    description: 'Total count + alphabetical list of patients in the system. Use for "כמה מטופלות יש?", "מי המטופלות?", "האם יש מטופלות במערכת?", and similar questions about the patient roster as a whole. Optionally filter by status.',
    input_schema: {
      type: 'object',
      properties: {
        statusFilter: {
          type: 'string',
          enum: ['active', 'inactive', 'waiting'],
          description: 'Optional patient status filter. Omit to list all.',
        },
      },
    },
  },
  {
    name: 'openPatient',
    description:
      'Open a specific patient\'s card (real navigation, not a passive link). Use whenever the user says "פתח/תפתח/הכנס לכרטיס של [שם]" or similar explicit command. The drawer will router.push to the patient page.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hebrew full name (or partial). Matched ILIKE.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getPatientResponsibleStaff',
    description:
      'Who is responsible for a patient — coordinator (רכזת), therapist/instructor (מטפלת/מדריכה), team, and any other staff linked via staff_patients. Use for "מי אחראי על [שם]?", "מי המטפלת של [שם]?", "מי הרכזת של [שם]?".',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hebrew full name (or partial). Matched ILIKE.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getLatestSessionSummary',
    description:
      'Return the contents of the MOST RECENT session_summary for a patient — main topics, current state, progress, next steps, etc. Use for "מה היה בפגישה האחרונה של [שם]?", "סיכום אחרון של [שם]". Do NOT use this for activity counts; use getPatientOverview / getPatientTimeline for that.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hebrew full name (or partial). Matched ILIKE.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getPatientOverview',
    description:
      'Compact human-readable overview of one patient: status, coordinator, therapist, last session, next session, last summary topics. Use for "ספרי לי על [שם]", "מה המצב של [שם]?", "סקירה על [שם]". Prefer this over getPatientTimeline when the user asks an open-ended question about a specific patient — Timeline is counter-heavy.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hebrew full name (or partial). Matched ILIKE.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'help',
    description: 'Return the list of example questions the assistant can answer. Use only when the user explicitly asks for help or examples — not as a fallback.',
    input_schema: { type: 'object', properties: {} },
  },
];
