/**
 * Shared data-fetch for the monthly report.
 *
 *   Both the on-demand UI route and the monthly cron call this so the
 *   xlsx they produce is byte-equivalent.
 *
 *   What we fetch:
 *     - Every session in [start, end] of the chosen month with
 *       status = 'completed' (the report tracks worked hours, not
 *       cancellations or no-shows).
 *     - Patient full_name is joined in for the K column.
 *
 *   What we do NOT fetch:
 *     - Staff. This is a calendar-style monthly report — every session
 *       lands on the row matching its date, regardless of therapist.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSlot } from './buildFromTemplate';

export interface MonthlyFetchResult {
  sessions: SessionSlot[];
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

export async function fetchMonthlySessions(
  supabase: SupabaseClient,
  year:     number,
  month:    number,
): Promise<MonthlyFetchResult> {
  const range = monthRange(year, month);

  const { data, error } = await supabase
    .from('sessions')
    .select('date, start_time, end_time, notes, status, patient:patient_id(full_name)')
    .gte('date', range.start)
    .lte('date', range.end)
    .eq('status', 'completed')
    .order('date',       { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw new Error(`sessions fetch: ${error.message}`);

  type RawSession = {
    date: string; start_time: string; end_time: string;
    notes: string | null; status: string;
    patient: { full_name: string } | null;
  };

  const sessions: SessionSlot[] = ((data ?? []) as unknown as RawSession[])
    .map(s => ({
      date:         s.date,
      start_time:   s.start_time,
      end_time:     s.end_time,
      patient_name: s.patient?.full_name ?? null,
      notes:        s.notes,
    }));

  return { sessions, range };
}
