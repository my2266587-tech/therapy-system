/**
 * The single entry point for invoking an assistant tool.
 *
 * Everything that wants to run a tool — the heuristic parser today, a Claude
 * tool-use loop tomorrow — funnels through dispatchTool(). That is what
 * keeps the read-only contract enforceable: the dispatcher's switch is the
 * exhaustive list of permitted operations. Anything not in the switch
 * cannot run.
 *
 * READ-ONLY CONTRACT (do not break):
 *   - Every branch below calls a function from `tools.ts`.
 *   - Every function in `tools.ts` is SELECT-only.
 *   - When write capabilities arrive, they go through a SEPARATE
 *     `dispatchWriteTool` with its own confirmation flow — never added
 *     to this switch.
 *
 * FUTURE — AI MODE:
 *   When Claude tool-use is wired in, the call site looks like:
 *
 *     const aiResponse = await anthropic.messages.create({
 *       model: 'claude-opus-4-7',
 *       tools: TOOL_SCHEMAS,           // from toolSchemas.ts
 *       messages: [...]
 *     });
 *
 *     for (const block of aiResponse.content) {
 *       if (block.type === 'tool_use') {
 *         const result = await dispatchTool(supabase, block.name, block.input);
 *         // …feed result back as tool_result block…
 *       }
 *     }
 *
 *   No code change required to dispatch.ts itself — same toolNames, same shape.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as tools from './tools';
import type { ToolResult } from './tools';
import type { Intent } from './parser';

const NEEDS_PATIENT_NAME = 'לא ציינת שם של מטופלת.';

/* ── Canonical tool names (must match toolSchemas.ts) ────────────────── */

export const TOOL_NAMES = [
  'getSessionsByDate',
  'getUpcomingSessions',
  'getMissingSummaries',
  'getOpenPayments',
  'getPatientTimeline',
  'getPatientDocuments',
  'getPatientList',
  'openPatient',
  'getPatientResponsibleStaff',
  'getLatestSessionSummary',
  'getPatientOverview',
  'getHowTo',
  'help',
] as const;

export type ToolName = typeof TOOL_NAMES[number];

export function isKnownTool(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/* ── Heuristic parser → canonical tool name ──────────────────────────── */

export const INTENT_TO_TOOL: Record<Intent, ToolName | null> = {
  sessionsByDate:        'getSessionsByDate',
  upcomingSessions:      'getUpcomingSessions',
  missingSummaries:      'getMissingSummaries',
  openPayments:          'getOpenPayments',
  patientTimeline:       'getPatientTimeline',
  patientDocuments:      'getPatientDocuments',
  patientResponsible:    'getPatientResponsibleStaff',
  latestSessionSummary:  'getLatestSessionSummary',
  patientOverview:       'getPatientOverview',
  openPatient:           'openPatient',
  listPatients:          'getPatientList',
  howTo:                 'getHowTo',
  help:                  'help',
  unknown:               null,
};

/* ── Dispatcher ──────────────────────────────────────────────────────── */

/**
 * Run a single tool. Inputs are unpacked defensively because in AI mode the
 * shape comes from the model and may be malformed.
 *
 * Returns a ToolResult — never throws for "missing argument" cases (the user
 * sees a friendly Hebrew message instead). Genuine DB errors propagate up
 * to the API route, which turns them into 500s.
 */
export async function dispatchTool(
  supabase: SupabaseClient,
  name:     string,
  input:    Record<string, unknown>,
): Promise<ToolResult> {
  if (!isKnownTool(name)) {
    return { answer: `הכלי "${name}" אינו מוכר.` };
  }

  switch (name) {
    case 'getSessionsByDate': {
      const start = typeof input.start === 'string' ? input.start : null;
      const end   = typeof input.end   === 'string' ? input.end   : null;
      const label = typeof input.label === 'string' ? input.label : '';
      if (!start || !end) {
        return { answer: 'חסר טווח תאריכים. צייני "היום", "מחר", "ביום שני" וכד׳.' };
      }
      return tools.getSessionsByDate(supabase, { start, end, label });
    }

    case 'getUpcomingSessions':
      return tools.getUpcomingSessions(supabase);

    case 'getMissingSummaries':
      return tools.getMissingSummaries(supabase);

    case 'getOpenPayments':
      return tools.getOpenPayments(supabase);

    case 'getPatientTimeline': {
      const name = typeof input.name === 'string' ? input.name : null;
      if (!name) return { answer: 'לא ציינת שם של מטופלת.' };
      return tools.getPatientTimeline(supabase, name);
    }

    case 'getPatientDocuments': {
      const name = typeof input.name === 'string' ? input.name : null;
      if (!name) {
        return { answer: 'לא ציינת שם של מטופלת. נסי: "אילו מסמכים יש למטופלת [שם]?"' };
      }
      return tools.getPatientDocuments(supabase, name);
    }

    case 'getPatientList': {
      const statusFilter = typeof input.statusFilter === 'string' ? input.statusFilter : undefined;
      return tools.getPatientList(supabase, { statusFilter });
    }

    case 'openPatient': {
      const name = typeof input.name === 'string' ? input.name : null;
      if (!name) return { answer: NEEDS_PATIENT_NAME };
      return tools.openPatient(supabase, name);
    }

    case 'getPatientResponsibleStaff': {
      const name = typeof input.name === 'string' ? input.name : null;
      if (!name) return { answer: NEEDS_PATIENT_NAME };
      return tools.getPatientResponsibleStaff(supabase, name);
    }

    case 'getLatestSessionSummary': {
      const name = typeof input.name === 'string' ? input.name : null;
      if (!name) return { answer: NEEDS_PATIENT_NAME };
      return tools.getLatestSessionSummary(supabase, name);
    }

    case 'getPatientOverview': {
      const name = typeof input.name === 'string' ? input.name : null;
      if (!name) return { answer: NEEDS_PATIENT_NAME };
      return tools.getPatientOverview(supabase, name);
    }

    case 'getHowTo': {
      const topic = typeof input.topic === 'string' ? input.topic : 'index';
      return tools.getHowToResult(topic);
    }

    case 'help':
      return tools.helpResult();
  }
}
