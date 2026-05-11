/**
 * Shared data-fetch for the monthly report bundle.
 *
 *   Both the on-demand UI route and the monthly cron call this so the
 *   xlsx they produce is byte-equivalent. The function is responsible
 *   for the SELECT pattern that defines "who appears in the report and
 *   with what sessions" — nothing about formatting or file generation
 *   lives here.
 *
 *   Filter rules (must stay in sync with the docs in the cron route):
 *     - Every staff row is included (alphabetical), even those with 0
 *       sessions in the month — they get a blank sheet with formulas.
 *     - A session counts toward a staff member iff its patient's
 *       primary therapist is that staff member (patients.staff_id) AND
 *       the session status is 'completed' AND the session falls in
 *       [start, end] of the chosen month.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffEntry, SessionSlot } from './buildFromTemplate';
import type { StaffRole } from '@/types';

export interface BundleFetchResult {
  staff: StaffEntry[];
  /** Inclusive month bounds — handy for logs. */
  range: { start: string; end: string };
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end:   `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export async function fetchMonthlyBundleData(
  supabase: SupabaseClient,
  year:     number,
  month:    number,
): Promise<BundleFetchResult> {
  const range = monthRange(year, month);

  const { data: staffData, error: staffErr } = await supabase
    .from('staff')
    .select('id, full_name, role, employee_number')
    .order('full_name');
  if (staffErr) throw new Error(`staff fetch: ${staffErr.message}`);
  const allStaff = staffData ?? [];

  const { data: rawSessions, error: sessErr } = await supabase
    .from('sessions')
    .select('date, start_time, end_time, notes, status, patient:patient_id(full_name, staff_id)')
    .gte('date', range.start)
    .lte('date', range.end)
    .eq('status', 'completed')
    .order('date',       { ascending: true })
    .order('start_time', { ascending: true });
  if (sessErr) throw new Error(`sessions fetch: ${sessErr.message}`);

  type RawSession = {
    date: string; start_time: string; end_time: string;
    notes: string | null; status: string;
    patient: { full_name: string; staff_id: string | null } | null;
  };
  const byStaff = new Map<string, SessionSlot[]>();
  for (const s of (rawSessions ?? []) as unknown as RawSession[]) {
    const sid = s.patient?.staff_id ?? null;
    if (!sid) continue;
    const slot: SessionSlot = {
      date:         s.date,
      start_time:   s.start_time,
      end_time:     s.end_time,
      patient_name: s.patient?.full_name ?? null,
      notes:        s.notes,
    };
    const arr = byStaff.get(sid);
    if (arr) arr.push(slot); else byStaff.set(sid, [slot]);
  }

  const staff: StaffEntry[] = allStaff.map(s => ({
    staff: {
      full_name:       s.full_name,
      role:            s.role as StaffRole,
      employee_number: s.employee_number ?? null,
    },
    sessions: byStaff.get(s.id) ?? [],
  }));

  return { staff, range };
}
