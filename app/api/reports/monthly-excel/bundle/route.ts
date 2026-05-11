/**
 * GET /api/reports/monthly-excel/bundle?year=YYYY&month=M
 *
 *   On-demand monthly hours report — a SINGLE xlsx with one sheet per
 *   staff member (plus the shared `גיליון1` lookup sheet) generated
 *   from `public/templates/monthly-report-template.xlsx`.
 *
 *   This is the same file the cron route emails on the 1st of every
 *   month; both go through buildMonthlyReportBundle / fetchMonthlyBundleData.
 *
 *   Auth:    Bearer token of an active authorized user.
 *   Output:  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *            Content-Disposition: attachment; filename="monthly-report-YYYY-MM-<month>.xlsx"
 *   Headers: X-Report-Staff   (number of main sheets in the file)
 *            X-Report-Total-Sessions (sum across all staff)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { buildMonthlyReportBundle } from '@/lib/reports/buildFromTemplate';
import { fetchMonthlyBundleData } from '@/lib/reports/fetchBundleData';

/** Bundle for many staff over a busy month can be a few seconds —
 *  give plenty of headroom. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const year  = Number(sp.get('year'));
  const month = Number(sp.get('month'));
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'year נדרש (4 ספרות)' }, { status: 400 });
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'month נדרש (1-12)' }, { status: 400 });
  }

  const supabase = createServerClient();

  let fetched;
  try {
    fetched = await fetchMonthlyBundleData(supabase, year, month);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  if (fetched.staff.length === 0) {
    return NextResponse.json(
      { error: 'אין אנשי צוות במערכת — אין מה להפיק.' },
      { status: 404 },
    );
  }

  let result;
  try {
    result = await buildMonthlyReportBundle({
      staff: fetched.staff,
      year,
      month,
    });
  } catch (e) {
    console.error('[reports/monthly-excel/bundle] build failed:', e);
    return NextResponse.json(
      { error: `שגיאה ביצירת הדוח: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const totalSessions = result.perStaff.reduce((s, p) => s + p.sessionCount, 0);

  return new NextResponse(result.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':    `attachment; filename="${result.fileName}"`,
      'Cache-Control':          'no-store',
      'X-Report-Staff':         String(result.perStaff.length),
      'X-Report-Total-Sessions': String(totalSessions),
    },
  });
}
