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

/**
 * Real navigation directive the drawer should ACT on (not just render).
 * Today the only one is open_patient. Add more (open_session, …) here
 * when needed — keep the union closed so the drawer can switch on it.
 */
export type AssistantAction =
  | { type: 'open_patient'; patient_id: string; patient_name: string };

export interface ToolResult {
  answer: string;
  links?: Link[];
  rows?:  RowItem[];
  /** When set, the drawer performs the action (e.g. router.push). */
  action?: AssistantAction;
  /**
   * "Who are we talking about now." When the tool resolved a specific
   * patient, set this so the drawer can remember her across follow-up
   * questions ("יש לה מסמכים?"). The drawer echoes it back on the next
   * request as context.lastPatient.
   */
  patient_focus?: { id: string; name: string };
}

const SESSION_STATUS_HE: Record<string, string> = {
  planned:   'מתוכננת',
  completed: 'הושלמה',
  cancelled: 'בוטלה',
  no_show:   'לא הגיעה',
};

const PATIENT_STATUS_HE: Record<string, string> = {
  active:   'פעילה',
  inactive: 'לא פעילה',
  waiting:  'ממתינה',
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
    patient_focus: { id: patient.id, name: patient.full_name },
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
      patient_focus: { id: found.id, name: found.full_name },
    };
  }

  return {
    answer: `${pluralBy(rows.length, 'מסמך', 'מסמכים')} עבור ${found.full_name}:`,
    rows: rows.slice(0, 20).map(d => ({
      title:    d.file_name,
      subtitle: new Date(d.uploaded_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }),
    })),
    links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${found.id}` }],
    patient_focus: { id: found.id, name: found.full_name },
  };
}

/* ── 9. Patient list / count ───────────────────────────────────────────── */

export async function getPatientList(
  supabase: SupabaseClient,
  opts: { statusFilter?: string } = {},
): Promise<ToolResult> {
  let query = supabase
    .from('patients')
    .select('id, full_name, status', { count: 'exact' })
    .order('full_name')
    .limit(20);

  if (opts.statusFilter) {
    query = query.eq('status', opts.statusFilter);
  }

  const { data, error, count } = await query;
  if (error) return { answer: `שגיאה: ${error.message}` };

  const total = count ?? 0;
  const rows = (data ?? []) as Array<{ id: string; full_name: string; status: string }>;

  if (total === 0) {
    return {
      answer: opts.statusFilter
        ? `אין מטופלות במצב ${PATIENT_STATUS_HE[opts.statusFilter] ?? opts.statusFilter}.`
        : 'אין מטופלות במערכת עדיין.',
    };
  }

  const filterLabel = opts.statusFilter
    ? ` (${PATIENT_STATUS_HE[opts.statusFilter] ?? opts.statusFilter})`
    : '';
  const showing = rows.length < total ? ` — מוצגות ${rows.length} מתוך ${total}` : '';

  return {
    answer: `${pluralBy(total, 'מטופלת', 'מטופלות')}${filterLabel} במערכת${showing}:`,
    rows: rows.map(p => ({
      title:    p.full_name,
      subtitle: PATIENT_STATUS_HE[p.status] ?? p.status,
      href:     `/patients/${p.id}`,
    })),
    links: [{ label: 'פתח כל המטופלות', href: '/patients' }],
  };
}

/* ── 10. Open a patient card (navigation action) ───────────────────────── */

/**
 * Returns an action the drawer must execute (router.push). Differs from
 * the "פתח כרטיס מטופלת" links the other tools sometimes attach: those
 * are passive chips the user can click; this is the model EXPLICITLY
 * being asked to open a card and it should happen without an extra tap.
 */
export async function openPatient(
  supabase: SupabaseClient, name: string,
): Promise<ToolResult> {
  const found = await findPatient(supabase, name);
  if (!found) return { answer: `לא נמצאה מטופלת בשם "${name}".` };
  if ('ambiguous' in found) {
    return {
      answer: `נמצאו כמה מטופלות עם השם "${name}". איזו לפתוח?`,
      rows: found.ambiguous.map(p => ({
        title: p.full_name,
        href:  `/patients/${p.id}`,
      })),
    };
  }
  return {
    answer: `פותחת את הכרטיס של ${found.full_name}.`,
    action: { type: 'open_patient', patient_id: found.id, patient_name: found.full_name },
    patient_focus: { id: found.id, name: found.full_name },
  };
}

/* ── 11. Who is responsible for a patient (coordinator + therapist + team) */

export async function getPatientResponsibleStaff(
  supabase: SupabaseClient, name: string,
): Promise<ToolResult> {
  const found = await findPatient(supabase, name);
  if (!found) return { answer: `לא נמצאה מטופלת בשם "${name}".` };
  if ('ambiguous' in found) {
    return {
      answer: `נמצאו כמה מטופלות עם השם "${name}". איזו התכוונת?`,
      rows: found.ambiguous.map(p => ({
        title: p.full_name,
        href:  `/patients/${p.id}`,
      })),
    };
  }

  // Pull FK names + free-text fallbacks the importer wrote when no FK
  // resolved (coordinator_name / guide_name / team_name).
  const { data: pData, error: pErr } = await supabase
    .from('patients')
    .select(`
      coordinator_name, guide_name, team_name,
      coordinator:coordinator_id(full_name),
      staff_member:staff_id(full_name, role)
    `)
    .eq('id', found.id)
    .maybeSingle();

  if (pErr) return { answer: `שגיאה: ${pErr.message}` };

  const p = (pData ?? {}) as {
    coordinator_name: string | null;
    guide_name:       string | null;
    team_name:        string | null;
    coordinator:      { full_name: string } | null;
    staff_member:     { full_name: string; role: string } | null;
  };

  // Also pull every staff_patients link so additional therapists /
  // instructors not on patients.staff_id still show up.
  const { data: spData } = await supabase
    .from('staff_patients')
    .select('staff:staff_id(full_name, role)')
    .eq('patient_id', found.id);

  const ROLE_HE: Record<string, string> = {
    coordinator: 'רכזת', instructor: 'מדריכה', therapist: 'מטפלת',
    manager:     'מנהל',  kabas:      'קב"ס',    ravas:    'רב"ס',
  };

  const rows: RowItem[] = [];

  const coordinator = p.coordinator?.full_name ?? p.coordinator_name ?? null;
  if (coordinator) {
    rows.push({ title: `רכזת: ${coordinator}` });
  } else {
    rows.push({ title: 'רכזת: לא הוגדרה' });
  }

  const therapist = p.staff_member;
  if (therapist) {
    rows.push({
      title: `${ROLE_HE[therapist.role] ?? 'איש צוות'}: ${therapist.full_name}`,
    });
  } else if (p.guide_name) {
    rows.push({ title: `מדריכה: ${p.guide_name}` });
  } else {
    rows.push({ title: 'מטפלת/מדריכה: לא הוגדרה' });
  }

  if (p.team_name) {
    rows.push({ title: `צוות: ${p.team_name}` });
  }

  type StaffJoin = { staff: { full_name: string; role: string } | null };
  const extras = ((spData ?? []) as unknown as StaffJoin[])
    .map(r => r.staff)
    .filter((s): s is NonNullable<typeof s> => s !== null)
    // Drop the therapist we already printed to avoid duplication.
    .filter(s => s.full_name !== therapist?.full_name);

  for (const s of extras) {
    rows.push({ title: `${ROLE_HE[s.role] ?? 'איש צוות'}: ${s.full_name}` });
  }

  return {
    answer: `אחראים על ${found.full_name}:`,
    rows,
    links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${found.id}` }],
    patient_focus: { id: found.id, name: found.full_name },
  };
}

/* ── 12. Most recent session summary contents ──────────────────────────── */

export async function getLatestSessionSummary(
  supabase: SupabaseClient, name: string,
): Promise<ToolResult> {
  const found = await findPatient(supabase, name);
  if (!found) return { answer: `לא נמצאה מטופלת בשם "${name}".` };
  if ('ambiguous' in found) {
    return {
      answer: `נמצאו כמה מטופלות עם השם "${name}". איזו התכוונת?`,
      rows: found.ambiguous.map(p => ({
        title: p.full_name,
        href:  `/patients/${p.id}`,
      })),
    };
  }

  const { data, error } = await supabase
    .from('session_summaries')
    .select('date, main_topics, treatment_actions, current_state, next_steps, tasks_given, progress, difficulties, notes')
    .eq('patient_id', found.id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { answer: `שגיאה: ${error.message}` };
  if (!data) {
    return {
      answer: `אין סיכומי פגישה עבור ${found.full_name}.`,
      links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${found.id}` }],
      patient_focus: { id: found.id, name: found.full_name },
    };
  }

  const sec: { label: string; value: string | null }[] = [
    { label: 'נושאים עיקריים',  value: data.main_topics },
    { label: 'מצב נוכחי',       value: data.current_state },
    { label: 'פעולות טיפוליות', value: data.treatment_actions },
    { label: 'התקדמות',         value: data.progress },
    { label: 'קשיים',           value: data.difficulties },
    { label: 'צעדים הבאים',     value: data.next_steps },
    { label: 'משימות',          value: data.tasks_given },
    { label: 'הערות',           value: data.notes },
  ];

  const rows: RowItem[] = sec
    .filter(s => s.value && s.value.trim())
    .map(s => ({ title: s.label, subtitle: s.value as string }));

  const dateLabel = new Date(data.date).toLocaleDateString('he-IL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return {
    answer: `סיכום הפגישה האחרונה של ${found.full_name} (${dateLabel}):`,
    rows: rows.length > 0 ? rows : [{ title: 'הסיכום ריק.' }],
    links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${found.id}` }],
    patient_focus: { id: found.id, name: found.full_name },
  };
}

/* ── 13. Compact patient overview (status + key people + last/next) ────── */

export async function getPatientOverview(
  supabase: SupabaseClient, name: string,
): Promise<ToolResult> {
  const found = await findPatient(supabase, name);
  if (!found) return { answer: `לא נמצאה מטופלת בשם "${name}".` };
  if ('ambiguous' in found) {
    return {
      answer: `נמצאו כמה מטופלות עם השם "${name}". איזו התכוונת?`,
      rows: found.ambiguous.map(p => ({
        title: p.full_name,
        href:  `/patients/${p.id}`,
      })),
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [pRes, lastSess, nextSess, lastSum] = await Promise.all([
    supabase.from('patients')
      .select(`
        status, coordinator_name, guide_name, team_name,
        coordinator:coordinator_id(full_name),
        staff_member:staff_id(full_name)
      `)
      .eq('id', found.id)
      .maybeSingle(),
    supabase.from('sessions')
      .select('date, start_time, status')
      .eq('patient_id', found.id)
      .lte('date', today)
      .order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('sessions')
      .select('date, start_time')
      .eq('patient_id', found.id)
      .gt('date', today)
      .eq('status', 'planned')
      .order('date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('session_summaries')
      .select('date, main_topics')
      .eq('patient_id', found.id)
      .order('date', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const p = (pRes.data ?? {}) as {
    status: string | null;
    coordinator_name: string | null;
    guide_name: string | null;
    team_name: string | null;
    coordinator:  { full_name: string } | null;
    staff_member: { full_name: string } | null;
  };

  const rows: RowItem[] = [];
  if (p.status) rows.push({ title: `סטטוס: ${PATIENT_STATUS_HE[p.status] ?? p.status}` });

  const coord = p.coordinator?.full_name ?? p.coordinator_name;
  if (coord) rows.push({ title: `רכזת: ${coord}` });

  const therapist = p.staff_member?.full_name ?? p.guide_name;
  if (therapist) rows.push({ title: `מטפלת/מדריכה: ${therapist}` });

  if (p.team_name) rows.push({ title: `צוות: ${p.team_name}` });

  if (lastSess.data) {
    rows.push({
      title: `פגישה אחרונה: ${lastSess.data.date} · ${lastSess.data.start_time} (${SESSION_STATUS_HE[lastSess.data.status] ?? lastSess.data.status})`,
    });
  }
  if (nextSess.data) {
    rows.push({ title: `פגישה הבאה: ${nextSess.data.date} · ${nextSess.data.start_time}` });
  }
  if (lastSum.data?.main_topics) {
    rows.push({
      title: 'נושאי הפגישה האחרונה',
      subtitle: lastSum.data.main_topics,
    });
  }

  return {
    answer: `סקירה על ${found.full_name}:`,
    rows: rows.length > 0 ? rows : [{ title: 'אין עדיין נתונים על המטופלת.' }],
    links: [{ label: 'פתח כרטיס מטופלת', href: `/patients/${found.id}` }],
    patient_focus: { id: found.id, name: found.full_name },
  };
}

/* ── 14. Help / examples ───────────────────────────────────────────────── */

export const EXAMPLE_QUESTIONS = [
  'מי אחראי על שירן?',
  'מה היה בפגישה האחרונה של שירן?',
  'פתח כרטיס של שירן',
  'אילו פגישות יש היום?',
  'למי חסר סיכום פגישה?',
  'אילו תשלומים עדיין פתוחים?',
  'אילו הקלטות לא עובדו?',
] as const;

export function helpResult(): ToolResult {
  return {
    answer: 'אפשר לשאול אותי שאלות תפעוליות בעברית. למשל:',
    rows: EXAMPLE_QUESTIONS.map(q => ({ title: q })),
  };
}
