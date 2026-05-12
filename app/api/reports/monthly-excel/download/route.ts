/**
 * GET /api/reports/monthly-excel/download?year=YYYY&month=M
 *
 *   On-demand monthly report — ONE xlsx with a single sheet listing
 *   every completed session of the chosen month, filled into
 *   `public/templates/monthly-report-template.xlsx`. Same fetch + same
 *   generator as the cron route, so both produce byte-equivalent files.
 *
 *   Not a per-staff or per-therapist report — it's a calendar view of
 *   the practice's month.
 *
 *   Auth:    Bearer token of an active authorized user.
 *   Output:  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *            Content-Disposition: attachment; filename="monthly-report-YYYY-MM.xlsx"
 *            (pure ASCII — Hebrew in the filename makes Headers.set() throw)
 *   Headers: X-Report-Days           (distinct days written)
 *            X-Report-Total-Sessions (count of sessions in the month)
 *            X-Report-Skipped        (sessions beyond the 3rd on any day)
 *
 * Error surface:
 *   Every error path returns JSON `{ error: <message> }` so the UI can
 *   surface a real reason. The outer try/catch turns non-Response
 *   throws (auth crash, supabase init, header rejection, ExcelJS) into
 *   JSON with the actual error message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { buildMonthlyReport } from '@/lib/reports/buildFromTemplate';
import { fetchMonthlySessions } from '@/lib/reports/fetchMonthlySessions';

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
    const fetched  = await fetchMonthlySessions(supabase, year, month);

    const result = await buildMonthlyReport({
      sessions: fetched.sessions,
      year,
      month,
    });

    return new NextResponse(result.buffer as unknown as BodyInit, {
      headers: {
        'Content-Type':            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':     `attachment; filename="${result.fileName}"`,
        'Cache-Control':           'no-store',
        'X-Report-Days':           String(result.stats.daysCovered),
        'X-Report-Total-Sessions': String(result.stats.sessionCount),
        'X-Report-Skipped':        String(result.stats.daysSkippedExtra),
      },
    });

  } catch (err) {
    console.error('[monthly-report-download]', {
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
