/**
 * Archive a freshly-generated monthly xlsx + record the run in
 * `report_runs` so it shows up in the history list on /reports/monthly.
 *
 * Best-effort: any storage / DB failure here is logged and swallowed.
 * We don't want the user-facing download path to 500 just because the
 * audit trail isn't writable today.
 *
 * Both the cron route and the on-demand UI route call this AFTER
 * generation succeeds — the xlsx bytes are already in hand.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKETS } from '@/lib/storage';

const BUCKET = BUCKETS.monthlyReports;

export interface ArchiveInput {
  supabase:       SupabaseClient;
  year:           number;
  month:          number;
  buffer:         Buffer;
  fileName:       string;
  /** 'cron' or the user's identifier (email/id). Free-text. */
  generatedBy:    string | null;
  sessionsCount:  number;
  daysCovered:    number;
}

export async function archiveMonthlyReport(opts: ArchiveInput): Promise<void> {
  const { supabase, year, month, buffer, fileName, generatedBy,
          sessionsCount, daysCovered } = opts;

  // Storage path: YYYY/MM/<run-id>.xlsx — by-month folders keep the
  // bucket browsable, and the random run-id leaves room for multiple
  // runs of the same month without overwriting earlier copies.
  const runId = crypto.randomUUID();
  const storagePath = `${year}/${String(month).padStart(2, '0')}/${runId}.xlsx`;

  try {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });
    if (upErr) {
      console.warn('[report-archive] storage upload failed:', upErr.message);
      // Still record the run as success (the user got their file) but
      // without a storage_path — they just can't re-download from history.
      await supabase.from('report_runs').insert({
        id:             runId,
        year, month,
        generated_by:   generatedBy,
        status:         'success',
        sessions_count: sessionsCount,
        days_covered:   daysCovered,
        file_name:      fileName,
        storage_path:   null,
        error_message:  `storage upload skipped: ${upErr.message}`,
      });
      return;
    }

    const { error: insErr } = await supabase.from('report_runs').insert({
      id:             runId,
      year, month,
      generated_by:   generatedBy,
      status:         'success',
      sessions_count: sessionsCount,
      days_covered:   daysCovered,
      file_name:      fileName,
      storage_path:   storagePath,
    });
    if (insErr) {
      console.warn('[report-archive] DB insert failed:', insErr.message);
      // Roll back the storage object so we don't leak orphans.
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    }
  } catch (e) {
    console.warn('[report-archive] unexpected failure:', (e as Error).message);
  }
}
