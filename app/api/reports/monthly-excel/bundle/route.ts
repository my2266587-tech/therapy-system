/**
 * GET /api/reports/monthly-excel/bundle?year=YYYY&month=M
 *
 *   On-demand monthly hours report — a SINGLE xlsx with one sheet per
 *   staff member (plus the shared `גיליון1` lookup sheet) generated
 *   from `public/templates/monthly-report-template.xlsx`.
 *
 *   Same generator/fetch as the cron route (POST /api/reports/monthly-excel),
 *   so both paths produce a byte-equivalent file.
 *
 *   Auth:    Bearer token of an active authorized user.
 *   Output:  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *            Content-Disposition: attachment; filename="monthly-report-YYYY-MM.xlsx"
 *            (pure ASCII — Hebrew in the filename makes Headers.set() throw)
 *   Headers: X-Report-Staff   (number of main sheets in the file)
 *            X-Report-Total-Sessions (sum across all staff)
 *
 * Error surface:
 *   Every error path returns JSON `{ error: <message> }` so the UI can
 *   surface a real reason instead of a bare 500. The outer try/catch
 *   exists specifically to convert non-Response throws (auth crash,
 *   supabase client init, header construction, etc.) into JSON.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { buildMonthlyReportBundle } from '@/lib/reports/buildFromTemplate';
import { fetchMonthlyBundleData } from '@/lib/reports/fetchBundleData';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthorizedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const fetched  = await fetchMonthlyBundleData(supabase, year, month);

    if (fetched.staff.length === 0) {
      return NextResponse.json(
        { error: 'אין אנשי צוות במערכת — אין מה להפיק.' },
        { status: 404 },
      );
    }

    const result = await buildMonthlyReportBundle({
      staff: fetched.staff,
      year,
      month,
    });
    const totalSessions = result.perStaff.reduce((s, p) => s + p.sessionCount, 0);

    return new NextResponse(result.buffer as unknown as BodyInit, {
      headers: {
        'Content-Type':            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':     `attachment; filename="${result.fileName}"`,
        'Cache-Control':           'no-store',
        'X-Report-Staff':          String(result.perStaff.length),
        'X-Report-Total-Sessions': String(totalSessions),
      },
    });

  } catch (err) {
    // Anything that escaped the happy path — auth crash, supabase init
    // failure, query throw, ExcelJS throw, Headers ByteString rejection,
    // etc. Log with full context so Vercel function logs are useful.
    console.error('[monthly-report-bundle]', {
      message: (err as Error)?.message,
      stack:   (err as Error)?.stack,
      url:     req.nextUrl.toString(),
    });
    const message = (err as Error)?.message ?? 'שגיאה לא צפויה';
    return NextResponse.json(
      { error: `שגיאה בהפקת הדוח: ${message}` },
      { status: 500 },
    );
  }
}
