/**
 * POST /api/reports/monthly-excel
 *
 *   Cron-driven monthly hours report. Generates ONE xlsx with one sheet
 *   per staff member (plus the shared `גיליון1` lookup sheet), then
 *   emails it as a SINGLE attachment via Resend.
 *
 *   The on-demand UI at /reports/monthly hits
 *   GET /api/reports/monthly-excel/bundle and produces a byte-equivalent
 *   file — same generator (buildMonthlyReportBundle), same fetch
 *   (fetchMonthlyBundleData).
 *
 * Auth:
 *   - Bearer CRON_SECRET (set by Vercel Cron; also accepts manual triggers
 *     when called with the same secret).
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
import { buildMonthlyReportBundle } from '@/lib/reports/buildFromTemplate';
import { fetchMonthlyBundleData } from '@/lib/reports/fetchBundleData';

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
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const year  = Number(params.get('year'))  || getPreviousMonth().year;
  const month = Number(params.get('month')) || getPreviousMonth().month;

  if (month < 1 || month > 12 || year < 2000) {
    return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // 1. Pull staff + sessions via the SAME helper the UI uses.
    const fetched = await fetchMonthlyBundleData(supabase, year, month);
    if (fetched.staff.length === 0) {
      return NextResponse.json({ message: 'No staff found' }, { status: 200 });
    }

    // 2. Build the single bundled xlsx.
    const result = await buildMonthlyReportBundle({
      staff: fetched.staff,
      year,
      month,
    });
    const totalSessions = result.perStaff.reduce((s, p) => s + p.sessionCount, 0);

    // 3. Email path (or fallback to direct download when not configured).
    const resendKey = process.env.RESEND_API_KEY;
    const emailTo   = process.env.REPORT_EMAIL_TO;
    const monthName = HEB_MONTHS[month] ?? String(month);

    if (!resendKey || !emailTo) {
      return new NextResponse(result.buffer as unknown as BodyInit, {
        headers: {
          'Content-Type':           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':    `attachment; filename="${result.fileName}"`,
          'Cache-Control':          'no-store',
          'X-Report-Staff':         String(result.perStaff.length),
          'X-Report-Total-Sessions': String(totalSessions),
          'X-Report-Mode':          'fallback-no-email',
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
          <p>מצורף קובץ Excel אחד לחודש <strong>${monthName} ${year}</strong>
             עם דוח נפרד לכל אחד מ-${result.perStaff.length} אנשי הצוות
             (גיליון לכל איש צוות באותו הקובץ).</p>
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
      staff: result.perStaff.length,
      sessions: totalSessions,
    });

  } catch (err) {
    console.error('[monthly-excel]', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}

/** Manual browser trigger — same handler, same auth. */
export async function GET(req: NextRequest) {
  return POST(req);
}
