/**
 * POST /api/reports/monthly-excel
 *
 *   Cron-driven monthly report. Produces ONE xlsx of every session
 *   summary in the chosen month (calendar view — no per-staff split),
 *   then emails it as a SINGLE attachment via Resend.
 *
 *   The on-demand UI at /reports/monthly hits
 *   GET /api/reports/monthly-excel/download and produces a byte-equivalent
 *   file — same fetch (fetchMonthlySessions), same generator
 *   (buildMonthlyReport), same source table (session_summaries).
 *
 * Auth:
 *   - Bearer ${CRON_SECRET}. Vercel Cron sets this; manual triggers
 *     accepted with the same secret.
 *
 * Query params (optional):
 *   ?year=2026&month=2   — override the default (previous month).
 *
 * Env vars (all required for actual send):
 *   - CRON_SECRET          — shared secret used by Vercel Cron + manual triggers
 *   - RESEND_API_KEY       — Resend API key
 *   - REPORT_EMAIL_TO      — recipient address (currently mp399066@gmail.com)
 *   - REPORT_EMAIL_FROM    — sender address (must be a Resend-verified domain)
 *
 *   Missing env vars produce an explicit JSON error — never a silent
 *   fallback, never a bare 500.
 *
 * Response shape (success):
 *   {
 *     ok:            true,
 *     month:         3,
 *     year:          2026,
 *     recipient:     'mp399066@gmail.com',
 *     sessionsCount: 8,
 *     fileName:      'monthly-report-2026-03.xlsx'
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerClient } from '@/lib/supabaseServer';
import { buildMonthlyReport } from '@/lib/reports/buildFromTemplate';
import { fetchMonthlySessions } from '@/lib/reports/fetchMonthlySessions';
import { getPreviousMonth } from '@/lib/reports/previousMonth';
import { archiveMonthlyReport } from '@/lib/reports/archive';

export const maxDuration = 60;

const DEFAULT_FROM = 'system@maharchacher.co.il';

// Always include this payroll/accountant address as a recipient, in addition
// to whatever REPORT_EMAIL_TO is configured to — both get a copy (deduped).
const FIXED_RECIPIENT = 's0548539967@gmail.com';

const HEB_MONTHS: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ',     4: 'אפריל',
  5: 'מאי',   6: 'יוני',   7: 'יולי',     8: 'אוגוסט',
  9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
};

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth gate — both Vercel Cron and manual triggers go through here.
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'CRON_SECRET לא מוגדר בסביבה — אי אפשר לאמת בקשת cron.' },
        { status: 500 },
      );
    }
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Env vars required for actual send. Check up-front so the user
    //    sees a clear reason in the response instead of an obscure 500
    //    after the report has already been built.
    const resendKey = process.env.RESEND_API_KEY;
    const emailTo   = process.env.REPORT_EMAIL_TO;
    const emailFrom = process.env.REPORT_EMAIL_FROM ?? DEFAULT_FROM;
    const missing: string[] = [];
    if (!resendKey) missing.push('RESEND_API_KEY');
    if (!emailTo)   missing.push('REPORT_EMAIL_TO');
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error:    `הגדרות מייל חסרות: ${missing.join(', ')}. הוסיפי אותן ל-Vercel project env ונסי שוב.`,
          missing,
        },
        { status: 500 },
      );
    }

    // 3. Resolve year/month — explicit query params override the
    //    cron's "previous month" default.
    const params = req.nextUrl.searchParams;
    const defaults = getPreviousMonth();
    const year  = Number(params.get('year'))  || defaults.year;
    const month = Number(params.get('month')) || defaults.month;
    if (!Number.isInteger(year)  || year  < 2000 || year  > 2100) {
      return NextResponse.json({ error: 'year לא תקין (4 ספרות, 2000-2100)' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'month לא תקין (1-12)' }, { status: 400 });
    }

    // 4. Build the report.
    const supabase = createServerClient();
    const fetched  = await fetchMonthlySessions(supabase, year, month);
    const result   = await buildMonthlyReport({
      sessions: fetched.sessions,
      year,
      month,
    });

    // Archive + audit (best-effort, internal-only).
    await archiveMonthlyReport({
      supabase,
      year,
      month,
      buffer:        result.buffer,
      fileName:      result.fileName,
      generatedBy:   'cron',
      sessionsCount: result.stats.sessionCount,
      daysCovered:   result.stats.daysCovered,
    });

    // 5. Send the single attachment. Always include the fixed payroll
    //    recipient alongside REPORT_EMAIL_TO — both get a copy (deduped).
    const monthName = HEB_MONTHS[month] ?? String(month);
    const recipients = Array.from(new Set([emailTo!, FIXED_RECIPIENT]));
    const resend = new Resend(resendKey!);
    const { error: emailErr } = await resend.emails.send({
      from:    emailFrom,
      to:      recipients,
      subject: `דו"ח שעות חודשי – ${monthName} ${year}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2>דו"ח שעות חודשי</h2>
          <p>מצורף קובץ Excel אחד לחודש <strong>${monthName} ${year}</strong>.</p>
          <p>הדוח כולל ${result.stats.sessionCount} סיכומי פגישות,
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
    if (emailErr) {
      throw new Error(`Resend send failed: ${JSON.stringify(emailErr)}`);
    }

    return NextResponse.json({
      ok:            true,
      month,
      year,
      recipient:     recipients,
      sessionsCount: result.stats.sessionCount,
      fileName:      result.fileName,
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
