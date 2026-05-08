/**
 * Read-only tools the assistant can call.
 *
 * READ-ONLY CONTRACT — DO NOT BREAK
 * ─────────────────────────────────
 * Every function below:
 *   - Takes a Supabase client (server-side, service-role) injected by the caller.
 *   - Calls only SELECT-style supabase methods (`.select`, `.from(...).select`).
 *   - Returns { answer, links?, rows? } — the shape the API forwards to the UI.
 *   - NEVER inserts, updates, deletes, signs URLs, sends emails, or otherwise
 *     mutates state. No `.insert`, `.update`, `.delete`, `.upsert`, `.rpc`
 *     against a write-side function — none of it.
 *
 * Reviewing a PR that touches this file? If it adds any non-SELECT call,
 * the answer is no. Write tools live in a separate file with their own
 * dispatcher and a per-call confirmation token (see toolSchemas.ts header).
 *
 * Adding a NEW read-only tool:
 *   1. Implement it here (signature: `(supabase, ...args) => Promise<ToolResult>`).
 *   2. Add it to dispatch.ts (`TOOL_NAMES` + the dispatcher switch).
 *   3. Add a Claude schema entry in toolSchemas.ts.
 *   4. (Optional) extend parser.ts so the heuristic fallback finds it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DateRange } from './dates';

export interface Link  { label: string; href: string; }
export interface RowItem {
  title:    string;        // primary line
  subtitle?: string;       // secondary line
  href?:    string;        // optional deep link
}
export interface ToolResult {
  answer: string;
  links?: Link[];
  rows?:  RowItem[];
}

const SESSION_STATUS_HE: Record<string, string> = {
  planned:   'מתוכננת',
  completed: 'הושלמה',
  cancelled: 'בוטלה',
  no_show:   'לא הגיעה',
};

const PAID_STATUS_HE: Record<string, string> = {
  not_sent: 'לא נשלח',
  sent:     'נשלח',
  failed:   'כשל',
};

/* ── helpers ───────────────────────────────────────────────────────────── */

function pluralSessions(n: number): string {
  if (n === 0) return 'אין פגישות';
  if (n === 1) return 'פגישה אחת';
  return `${n} פגישות`;
}

function pluralBy(n: number, sing: string, plur: string): string {
  return n === 1 ? `${sing} אחד` : `${n} ${plur}`;
}

/* ── 1. Sessions in a date range ───────────────────────────────────────── */

export async function getSessionsByDate(
  supabase: SupabaseClient,
  range: DateRange,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, date, start_time, end_time, status, patient:patient_id(full_name, id)')
    .gte('date', range.start)
    .lte('date', range.end)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) return { answer: `שגיאה בטעינת פגישות: ${error.message}` };

  const rows = (data ?? []) as unknown as Array<{
    id: string; date: string; start_time: string; end_time: string; status: string;
    patient: { full_name: string; id: string } | null;
  }>;

  if (rows.length === 0) {
    return { answer: `אין פגישות ${range.label}.` };
  }

  return {
    answer: `${pluralSessions(rows.length)} ${range.label}:`,
    rows: rows.map(r => ({
      title:    r.patient?.full_name ?? 'מטופלת לא ידועה',
      subtitle: `${r.date} · ${r.start_time}–${r.end_time} · ${SESSION_STATUS_HE[r.status] ?? r.status}`,
      href:     r.patient?.id ? `/patients/${r.patient.id}` : undefined,
    })),
    links: [{ label: 'פתח יומן פגישות', href: '/sessions' }],
  };
}

/* ── 2. Upcoming planned sessions (next 14 days) ───────────────────────── */

export async function getUpcomingSessions(supabase: SupabaseClient): Promise<ToolResult> {
  const today = new Date();
  const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const { data, error } = await supabase
    .from('sessions')
    .select('id, date, start_time, end_time, patient:patient_id(full_name, id)')
    .eq('status', 'planned')
    .gte('date', ymd(today))
    .lte('date', ymd(in14))
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(10);

  if (error) return { answer: `שגיאה: ${error.message}` };

  const rows = (data ?? []) as unknown as Array<{
    id: string; date: string; start_time: string; end_time: string;
    patient: { full_name: string; id: string } | null;
  }>;

  if (rows.length === 0) return { answer: 'אין פגישות מתוכננות בשבועיים הקרובים.' };

  return {
    answer: `${pluralSessions(rows.length)} מתוכננות בשבועיים הקרובים:`,
    rows: rows.map(r => ({
      title:    r.patient?.full_name ?? 'מטופלת לא ידועה',
      subtitle: `${r.date} · ${r.start_time}–${r.end_time}`,
      href:     r.patient?.id ? `/patients/${r.patient.id}` : undefined,
    })),
    links: [{ label: 'פתח יומן פגישות', href: '/sessions' }],
  };
}

/* ── 3. Sessions completed without a session_summary ───────────────────── */

export async function getMissingSummaries(supabase: SupabaseClient): Promise<ToolResult> {
  // Fetch completed sessions, then filter out those that have a summary row.
  const { data: sess, error: sErr } = await supabase
    .from('sessions')
    .select('id, date, start_time, patient:patient_id(full_name, id)')
    .eq('status', 'completed')
    .order('date', { ascending: false })
    .limit(50);

  if (sErr) return { answer: `שגיאה: ${sErr.message}` };
  const sessions = (sess ?? []) as unknown as Array<{
    id: string; date: string; start_time: string;
    patient: { full_name: string; id: string } | null;
  }>;
  if (sessions.length === 0) return { answer: 'אין פגישות שהושלמו עדיין.' };

  const ids = sessions.map(s => s.id);
  const { data: sums, error: sumErr } = await supabase
    .from('session_summaries')
    .select('session_id')
    .in('session_id', ids);
  if (sumErr) return { answer: `שגיאה: ${sumErr.message}` };

  const have = new Set((sums ?? []).map(r => r.session_id));
  const missing = sessions.filter(s => !have.has(s.id));

  if (missing.length === 0) {
    return { answer: 'כל הפגישות שהושלמו תועדו בסיכומים.' };
  }

  return {
    answer: `${pluralBy(missing.length, 'פגישה', 'פגישות')} ללא סיכום:`,
    rows: missing.slice(0, 20).map(s => ({
      title:    s.patient?.full_name ?? 'מטופלת לא ידועה',
      subtitle: `${s.date} · ${s.start_time}`,
      href:     s.patient?.id ? `/patients/${s.patient.id}` : undefined,
    })),
    links: [{ label: 'פתח סיכומי פגישות', href: '/summaries' }],
  };
}

/* ── 4. Unpaid payments ────────────────────────────────────────────────── */

export async function getOpenPayments(supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, month, amount, payment_method, email_status, coordinator:coordinator_id(full_name)')
    .eq('is_paid', false)
    .order('month', { ascending: false });

  if (error) return { answer: `שגיאה: ${error.message}` };
  const rows = (data ?? []) as unknown as Array<{
    id: string; month: string; amount: number; payment_method: string | null;
    email_status: string; coordinator: { full_name: string } | null;
  }>;

  if (rows.length === 0) return { answer: 'אין תשלומים פתוחים — הכל שולם.' };

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return {
    answer: `${pluralBy(rows.length, 'תשלום', 'תשלומים')} פתוחים · סה"כ ₪${total.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}:`,
    rows: rows.slice(0, 20).map(r => ({
      title:    `${r.month} · ₪${Number(r.amount).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      subtitle: [
        r.coordinator?.full_name ?? null,
        `מייל: ${PAID_STATUS_HE[r.email_status] ?? r.email_status}`,
      ].filter(Boolean).join(' · '),
    })),
    links: [{ label: 'פתח תשלומי שיראל', href: '/payments' }],
  };
}

/* ── 5. Recordings still pending transcription ─────────────────────────── */

export async function getUnprocessedRecordings(supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('recordings')
    .select('id, recorded_at, status, patient:patient_id(full_name, id)')
    .eq('status', 'pending')
    .order('recorded_at', { ascending: false })
    .limit(20);

  if (error) return { answer: `שגיאה: ${error.message}` };
  const rows = (data ?? []) as unknown as Array<{
    id: string; recorded_at: string; status: string;
    patient: { full_name: string; id: string } | null;
  }>;

  if (rows.length === 0) return { answer: 'אין הקלטות שממתינות לתמלול.' };

  return {
    answer: `${pluralBy(rows.length, 'הקלטה', 'הקלטות')} ממתינות לתמלול:`,
    rows: rows.map(r => ({
      title:    r.patient?.full_name ?? 'מטופלת לא ידועה',
      subtitle: new Date(r.recorded_at).toLocaleString('he-IL', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      }),
      href:     '/recordings',
    })),
    links: [{ label: 'פתח הקלטות', href: '/recordings' }],
  };
}

/* ── 6. Find patient by name ───────────────────────────────────────────── */

export async function findPatient(
  supabase: SupabaseClient, name: string,
): Promise<{ id: string; full_name: string } | { ambiguous: Array<{ id: string; full_name: string }> } | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('id, full_name')
    .ilike('full_name', `%${name}%`)
    .limit(5);
  if (error || !data || data.length === 0) return null;
  if (data.length === 1) return data[0] as { id: string; full_name: string };
  return { ambiguous: data as Array<{ id: string; full_name: string }> };
}

/* ── 7. Patient timeline summary ───────────────────────────────────────── */

export async function getPatientTimeline(
  supabase: SupabaseClient, name: string,
): Promise<ToolResult> {
  const found = await findPatient(supabase, name);
  if (!found) return { answer: `לא נמצאה מטופלת בשם "${name}".` };
  if ('ambiguous' in found) {
    return {
      answer: `נמצאו כמה מטופלות עם השם "${name}". איזו התכוונת?`,
      rows: found.ambiguous.map(p => ({
        title: p.full_name,
        href: `/patients/${p.id}`,
      })),
    };
  }

  const patient = found;
  const today = new Date().toISOString().slice(0, 10);

  const [lastSess, nextSess, sumCount, recPending, docCount] = await Promise.all([
    supabase.from('sessions')
      .select('date, start_time, status')
      .eq('patient_id', patient.id)
      .lte('date', today)
      .order('date', { ascending: false })
      .limit(1).maybeSingle(),
    supabase.from('sessions')
      .select('date, start_time, status')
      .eq('patient_id', patient.id)
      .gt('date', today)
      .eq('status', 'planned')
      .order('date', { ascending: true })
      .limit(1).maybeSingle(),
    supabase.from('session_summaries')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patient.id),
    supabase.from('recordings')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patient.id)
      .eq('status', 'pending'),
    supabase.from('patient_documents')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patient.id),
  ]);

  const lines: string[] = [];
  if (lastSess.data) {
    lines.push(`פגישה אחרונה: ${lastSess.data.date} · ${lastSess.data.start_time} (${SESSION_STATUS_HE[lastSess.data.status] ?? lastSess.data.status})`);
  } else {
    lines.push('פגישה אחרונה: אין רישום.');
  }
  if (nextSess.data) {
    lines.push(`פגישה הבאה: ${nextSess.data.date} · ${nextSess.data.start_time}`);
  } else {
    lines.push('פגישה הבאה: לא מתוכננת.');
  }
  lines.push(`סיכומים: ${sumCount.count ?? 0}`);
  lines.push(`הקלטות ממתינות: ${recPending.count ?? 0}`);
  lines.push(`מסמכים: ${docCount.count ?? 0}`);

  return {
    answer: `סיכום פעילות עבור ${patient.full_name}:`,
    rows: lines.map(l => ({ title: l })),
    links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${patient.id}` }],
  };
}

/* ── 8. Documents for a patient ────────────────────────────────────────── */

export async function getPatientDocuments(
  supabase: SupabaseClient, name: string,
): Promise<ToolResult> {
  const found = await findPatient(supabase, name);
  if (!found) return { answer: `לא נמצאה מטופלת בשם "${name}".` };
  if ('ambiguous' in found) {
    return {
      answer: `נמצאו כמה מטופלות עם השם "${name}". איזו התכוונת?`,
      rows: found.ambiguous.map(p => ({
        title: p.full_name,
        href: `/patients/${p.id}`,
      })),
    };
  }

  const { data, error } = await supabase
    .from('patient_documents')
    .select('id, file_name, mime_type, file_size, uploaded_at')
    .eq('patient_id', found.id)
    .order('uploaded_at', { ascending: false });

  if (error) return { answer: `שגיאה: ${error.message}` };
  const rows = (data ?? []) as unknown as Array<{
    id: string; file_name: string; mime_type: string | null;
    file_size: number | null; uploaded_at: string;
  }>;

  if (rows.length === 0) {
    return {
      answer: `אין מסמכים עבור ${found.full_name}.`,
      links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${found.id}` }],
    };
  }

  return {
    answer: `${pluralBy(rows.length, 'מסמך', 'מסמכים')} עבור ${found.full_name}:`,
    rows: rows.slice(0, 20).map(d => ({
      title:    d.file_name,
      subtitle: new Date(d.uploaded_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }),
    })),
    links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${found.id}` }],
  };
}

/* ── 9. Help / examples ────────────────────────────────────────────────── */

export const EXAMPLE_QUESTIONS = [
  'אילו פגישות יש היום?',
  'מי המטופלות למחר?',
  'איזו פגישה הייתה ביום שני?',
  'למי חסר סיכום פגישה?',
  'אילו תשלומים עדיין פתוחים?',
  'אילו הקלטות לא עובדו?',
  'תני סיכום פעילות של [שם מטופלת]',
  'אילו מסמכים יש למטופלת [שם]?',
] as const;

export function helpResult(): ToolResult {
  return {
    answer: 'אפשר לשאול אותי שאלות תפעוליות בעברית. למשל:',
    rows: EXAMPLE_QUESTIONS.map(q => ({ title: q })),
  };
}
