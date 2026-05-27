/**
 * GET /api/reports/monthly-excel/history
 *
 *   Returns the most recent N runs of the monthly report — newest first.
 *   Each row carries a short-lived signed URL when the xlsx is still in
 *   storage, so the UI can offer "↓ הורד מחדש" without re-running the
 *   generator.
 *
 *   Auth: Bearer token of an active authorized user.
 *
 * Query params:
 *   ?limit=20   — cap rows returned (1..100, default 20)
 *
 * Response:
 *   {
 *     runs: [{
 *       id, year, month, generated_at, generated_by,
 *       status, sessions_count, days_covered,
 *       file_name, error_message,
 *       download_url    // null when storage_path is null
 *     }, ...]
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from '@/lib/storage';

const BUCKET = BUCKETS.monthlyReports;

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthorizedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const rawLimit = Number(sp.get('limit') ?? '20');
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 20;

    const supabase = createServerClient();
    const { data: rows, error } = await supabase
      .from('report_runs')
      .select('id, year, month, generated_at, generated_by, status, sessions_count, days_covered, file_name, storage_path, error_message')
      .order('generated_at', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mint signed URLs in one batch for rows that still have a stored xlsx.
    const paths = (rows ?? [])
      .map(r => (r as { storage_path: string | null }).storage_path)
      .filter((p): p is string => !!p);
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed, error: sErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (sErr) {
        console.warn('[reports history] createSignedUrls failed:', sErr.message);
      } else {
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
        }
      }
    }

    const runs = (rows ?? []).map(r => {
      const row = r as {
        id: string; year: number; month: number;
        generated_at: string; generated_by: string | null;
        status: string; sessions_count: number | null;
        days_covered: number | null; file_name: string | null;
        storage_path: string | null; error_message: string | null;
      };
      return {
        id:             row.id,
        year:           row.year,
        month:          row.month,
        generated_at:   row.generated_at,
        generated_by:   row.generated_by,
        status:         row.status,
        sessions_count: row.sessions_count,
        days_covered:   row.days_covered,
        file_name:      row.file_name,
        error_message:  row.error_message,
        download_url:   row.storage_path ? urlByPath.get(row.storage_path) ?? null : null,
      };
    });

    return NextResponse.json({ runs });
  } catch (err) {
    console.error('[reports history]', {
      message: (err as Error)?.message,
      stack:   (err as Error)?.stack,
    });
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'שגיאה לא צפויה' },
      { status: 500 },
    );
  }
}
