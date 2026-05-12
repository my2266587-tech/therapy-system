/**
 * POST /api/reports/monthly-excel
 *
 *   Cron-driven monthly report. Produces ONE xlsx with a single sheet
 *   containing every completed session in the month (calendar view —
 *   no per-staff split), then emails it as a SINGLE attachment.
 *
 *   The on-demand UI at /reports/monthly hits
 *   GET /api/reports/monthly-excel/download and produces a byte-equivalent
 *   file — same fetch (fetchMonthlySessions), same generator
 *   (buildMonthlyReport).
 *
 * Auth:
 *   - Bearer CRON_SECRET (set by Vercel Cron; manual triggers accepted
 *     with the same secret).
 *
 * Query params:
 *   ?year=2026&month=2   — override default (previous month)
 *
 * Behavior when email env vars are missing:
 *   - If RESEND_API_KEY or REPORT_EMAIL_TO is unset, the route streams
 *     the generated xlsx as a download response so the manual-trigger
 *     debug path remains useful in dev.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerClient } from '@/lib/supabaseServer';
import { buildMonthlyReport } from '@/lib/reports/buildFromTemplate';
import { fetchMonthlySessions } from '@/lib/reports/fetchMonthlySessions';

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function getPreviousMonth(): { year: number; month: number } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const HEB_MONTHS: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ',     4: 'אפריל',
  5: 'מאי',   6: 'יוני',   7: 'יולי',     8: 'אוגוסט',
  9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
};

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    const year  = Number(params.get('year'))  || getPreviousMonth().year;
    const month = Number(params.get('month')) || getPreviousMonth().month;
    if (month < 1 || month > 12 || year < 2000) {
      return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 });
    }

    const supabase = createServerClient();
    const fetched  = await fetchMonthlySessions(supabase, year, month);

    const result = await buildMonthlyReport({
      sessions: fetched.sessions,
      year,
      month,
    });

    const resendKey = process.env.RESEND_API_KEY;
    const emailTo   = process.env.REPORT_EMAIL_TO;
    const monthName = HEB_MONTHS[month] ?? String(month);

    if (!resendKey || !emailTo) {
      return new NextResponse(result.buffer as unknown as BodyInit, {
        headers: {
          'Content-Type':            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':     `attachment; filename="${result.fileName}"`,
          'Cache-Control':           'no-store',
          'X-Report-Days':           String(result.stats.daysCovered),
          'X-Report-Total-Sessions': String(result.stats.sessionCount),
          'X-Report-Mode':           'fallback-no-email',
        },
      });
    }

    const resend = new Resend(resendKey);
    const { error: emailErr } = await resend.emails.send({
      from:    'system@maharchacher.co.il',
      to:      emailTo,
      subject: `דו"ח שעות חודשי – ${monthName} ${year}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2>דו"ח שעות חודשי</h2>
          <p>מצורף קובץ Excel אחד לחודש <strong>${monthName} ${year}</strong>.</p>
          <p>הדוח כולל ${result.stats.sessionCount} פגישות שהתקיימו,
             על פני ${result.stats.daysCovered} ימים.</p>
          <p>– מערכת מחר אחר</p>
        </div>
      `,
      attachments: [
        {
          filename: result.fileName,
          content:  result.buffer.toString('base64'),
        },
      ],
    });
    if (emailErr) throw new Error(`email send: ${JSON.stringify(emailErr)}`);

    return NextResponse.json({
      ok:    true,
      month: `${year}-${String(month).padStart(2, '0')}`,
      file:  result.fileName,
      sessions: result.stats.sessionCount,
      days:     result.stats.daysCovered,
    });

  } catch (err) {
    console.error('[monthly-report-cron]', {
      message: (err as Error)?.message,
      stack:   (err as Error)?.stack,
      url:     req.nextUrl.toString(),
    });
    return NextResponse.json(
      { error: (err as Error)?.message ?? String(err) },
      { status: 500 },
    );
  }
}

/** Manual browser trigger — same handler, same auth. */
export async function GET(req: NextRequest) {
  return POST(req);
}
