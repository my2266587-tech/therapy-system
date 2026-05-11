/**
 * POST /api/reports/monthly-excel
 *
 *   Cron-driven monthly hours-report pipeline. Generates one xlsx per
 *   staff member by filling the SAME template the UI uses
 *   (public/templates/monthly-report-template.xlsx via buildMonthlyReport),
 *   then attaches every file to a single email via Resend.
 *
 *   The on-demand UI at /reports/monthly produces a byte-for-byte
 *   equivalent file — same generator, same staff query, same session
 *   filter (completed sessions for patients whose primary therapist is
 *   this staff member).
 *
 * Auth:
 *   - Bearer CRON_SECRET (set by Vercel Cron; can also be passed manually
 *     for ad-hoc triggers).
 *
 * Query params:
 *   ?year=2026&month=2   — override default (previous month)
 *
 * Behavior when email env vars are missing:
 *   - If RESEND_API_KEY or REPORT_EMAIL_TO is unset, the route streams
 *     the FIRST generated xlsx as a download instead of sending email.
 *     That keeps the manual-trigger debug path useful in dev.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerClient } from '@/lib/supabaseServer';
import { buildMonthlyReport, type SessionSlot } from '@/lib/reports/buildFromTemplate';
import type { StaffRole } from '@/types';

/** Generation is fast (template clone + value writes), but ~N staff
 *  × email send can easily exceed the default 10s. 60s is plenty. */
export const maxDuration = 60;

/* ── auth guard ─────────────────────────────────────────────────────── */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

/* ── date helpers ───────────────────────────────────────────────────── */
function getPreviousMonth(): { year: number; month: number } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end:   `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

const HEB_MONTHS: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ',     4: 'אפריל',
  5: 'מאי',   6: 'יוני',   7: 'יולי',     8: 'אוגוסט',
  9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
};

/* ── route handler ──────────────────────────────────────────────────── */
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

  const { start, end } = monthRange(year, month);

  try {
    const supabase = createServerClient();

    /* ── 1. All staff (incl. employee_number for G2 of the template). */
    const { data: staffData, error: staffErr } = await supabase
      .from('staff')
      .select('id, full_name, role, employee_number')
      .order('full_name');
    if (staffErr) throw new Error(`staff fetch: ${staffErr.message}`);
    const allStaff = staffData ?? [];

    /* ── 2. Completed sessions in the month, joined to patient.
     *    `notes` is fetched so it can flow into column L of the
     *    template — same as the on-demand route. */
    const { data: rawSessions, error: sessErr } = await supabase
      .from('sessions')
      .select('date, start_time, end_time, notes, status, patient:patient_id(full_name, staff_id)')
      .gte('date', start)
      .lte('date', end)
      .eq('status', 'completed')
      .order('date',       { ascending: true })
      .order('start_time', { ascending: true });
    if (sessErr) throw new Error(`sessions fetch: ${sessErr.message}`);

    /* ── 3. Group by primary-therapist staff_id (same filter the
     *    on-demand /api/reports/monthly-excel/[staff_id] uses). */
    type RawSession = {
      date: string; start_time: string; end_time: string;
      notes: string | null; status: string;
      patient: { full_name: string; staff_id: string | null } | null;
    };
    const byStaff = new Map<string, SessionSlot[]>();
    for (const s of (rawSessions ?? []) as unknown as RawSession[]) {
      const sid = s.patient?.staff_id ?? null;
      if (!sid) continue;
      const slot: SessionSlot = {
        date:         s.date,
        start_time:   s.start_time,
        end_time:     s.end_time,
        patient_name: s.patient?.full_name ?? null,
        notes:        s.notes,
      };
      const arr = byStaff.get(sid);
      if (arr) arr.push(slot); else byStaff.set(sid, [slot]);
    }

    /* ── 4. Build one xlsx per staff (including those with 0 sessions
     *    — they get a blank monthly sheet with all formulas in place). */
    const excelFiles: { fileName: string; buffer: Buffer; sessionCount: number }[] = [];
    for (const staff of allStaff) {
      const result = await buildMonthlyReport({
        staff: {
          full_name:       staff.full_name,
          role:            staff.role as StaffRole,
          employee_number: staff.employee_number ?? null,
        },
        sessions: byStaff.get(staff.id) ?? [],
        year,
        month,
      });
      excelFiles.push({
        fileName:     result.fileName,
        buffer:       result.buffer,
        sessionCount: result.stats.sessionCount,
      });
    }

    if (excelFiles.length === 0) {
      return NextResponse.json({ message: 'No staff found' }, { status: 200 });
    }

    /* ── 5. Email path (or fallback to first-file download). */
    const resendKey = process.env.RESEND_API_KEY;
    const emailTo   = process.env.REPORT_EMAIL_TO;
    const monthName = HEB_MONTHS[month] ?? String(month);

    if (!resendKey || !emailTo) {
      const first = excelFiles[0];
      return new NextResponse(first.buffer as unknown as BodyInit, {
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${first.fileName}"`,
          'Cache-Control':       'no-store',
          'X-Report-Files':      String(excelFiles.length),
          'X-Report-Mode':       'fallback-no-email',
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
          <p>מצורפים דו"חות שעות לחודש <strong>${monthName} ${year}</strong>
             עבור ${excelFiles.length} אנשי צוות.</p>
          <p>– מערכת מחר אחר</p>
        </div>
      `,
      attachments: excelFiles.map(f => ({
        filename: f.fileName,
        content:  f.buffer.toString('base64'),
      })),
    });
    if (emailErr) throw new Error(`email send: ${JSON.stringify(emailErr)}`);

    return NextResponse.json({
      ok:    true,
      month: `${year}-${String(month).padStart(2, '0')}`,
      files: excelFiles.map(f => ({ name: f.fileName, sessions: f.sessionCount })),
    });

  } catch (err) {
    console.error('[monthly-excel]', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}

/** Manual browser trigger — same handler, same auth check. */
export async function GET(req: NextRequest) {
  return POST(req);
}
