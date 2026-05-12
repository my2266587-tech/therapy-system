/**
 * Shared data-fetch for the monthly report.
 *
 *   Source of truth: `session_summaries`. The hours-report layout
 *   maps directly onto a finished summary — the summary is what proves
 *   a session was actually run, holds the real start/end times, the
 *   clinician's notes, and is joined to the patient for the K column.
 *   Raw `sessions` rows can be created in advance / cancelled / left
 *   empty, so they're not the right source for a "what actually
 *   happened this month" view.
 *
 *   Both the on-demand UI route and the monthly cron call this so the
 *   xlsx they produce is byte-equivalent.
 *
 *   What we fetch:
 *     - Every session_summaries row with date in [start, end] of the
 *       chosen month.
 *     - Patient full_name joined in for the K column.
 *
 *   What we do NOT fetch:
 *     - Staff. This is a calendar-style monthly report — every summary
 *       lands on the row matching its date, regardless of therapist.
 *     - Sessions (the planning/scheduling table). Summaries are the
 *       authoritative record of what actually happened.
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
    .from('session_summaries')
    .select('date, start_time, end_time, notes, patient:patient_id(full_name)')
    .gte('date', range.start)
    .lte('date', range.end)
    .order('date',       { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`session_summaries fetch: ${error.message}`);

  type RawSummary = {
    date: string;
    start_time: string | null;
    end_time:   string | null;
    notes: string | null;
    patient: { full_name: string } | null;
  };

  // Skip summaries without times — they can't drive a time-pair cell
  // in the template. They still count toward the K column (name) and L
  // column (notes), so we keep them with empty time strings, which the
  // generator's timeToFraction() handles by writing nothing into the
  // time cells but K/L do get the values.
  const sessions: SessionSlot[] = ((data ?? []) as unknown as RawSummary[])
    .map(s => ({
      date:         s.date,
      start_time:   s.start_time ?? '',
      end_time:     s.end_time   ?? '',
      patient_name: s.patient?.full_name ?? null,
      notes:        s.notes,
    }));

  return { sessions, range };
}
