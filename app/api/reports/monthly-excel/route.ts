/**
 * POST /api/reports/monthly-excel
 *
 * Generates a monthly hours-report Excel file for each staff member,
 * attaches them to an email via Resend, and returns 200.
 *
 * Protected by CRON_SECRET header (set by Vercel Cron).
 * Can also be triggered manually by passing the same secret.
 *
 * Query params:
 *   ?year=2026&month=2   — override default (previous month)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerClient } from '@/lib/supabaseServer';
import { buildMonthlyReports, StaffReport, SessionRow } from '@/lib/reports/monthlyExcel';

/* ── auth guard ── */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse if secret not configured
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

/* ── date helpers ── */
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
    end:   `${year}-${pad(month)}-${lastDay}`,
  };
}

/* ── route handler ── */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve report period
  const params = req.nextUrl.searchParams;
  const year  = Number(params.get('year'))  || getPreviousMonth().year;
  const month = Number(params.get('month')) || getPreviousMonth().month;

  if (month < 1 || month > 12 || year < 2000) {
    return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 });
  }

  const { start, end } = monthRange(year, month);

  try {
    const supabase = createServerClient();

    /* ── 1. Fetch all staff members ── */
    const { data: staffData, error: staffErr } = await supabase
      .from('staff')
      .select('id, full_name, role')
      .order('full_name');

    if (staffErr) throw new Error(`staff fetch: ${staffErr.message}`);
    const allStaff = staffData ?? [];

    /* ── 2. Fetch sessions with patient info ── */
    const { data: rawSessions, error: sessErr } = await supabase
      .from('sessions')
      .select('date, start_time, end_time, status, patient:patient_id(full_name, staff_id)')
      .gte('date', start)
      .lte('date', end)
      .eq('status', 'completed')
      .order('date')
      .order('start_time');

    if (sessErr) throw new Error(`sessions fetch: ${sessErr.message}`);

    /* ── 3. Group sessions by staff_id ── */
    const byStaff = new Map<string, SessionRow[]>();

    for (const s of (rawSessions ?? []) as any[]) {
      const staffId: string | null = s.patient?.staff_id ?? null;
      if (!staffId) continue; // skip sessions without assigned therapist

      const row: SessionRow = {
        date:         s.date,
        start_time:   s.start_time,
        end_time:     s.end_time,
        patient_name: s.patient?.full_name ?? 'לא ידוע',
      };

      if (!byStaff.has(staffId)) byStaff.set(staffId, []);
      byStaff.get(staffId)!.push(row);
    }

    /* ── 4. Build StaffReport objects ── */
    const reports: StaffReport[] = [];

    for (const staff of allStaff) {
      const sessions = byStaff.get(staff.id) ?? [];
      // Include all staff members — even those with 0 sessions (blank report)
      const nameParts = staff.full_name.trim().split(/\s+/);
      reports.push({
        staff_id:   staff.id,
        first_name: nameParts[0] ?? '',
        last_name:  nameParts.slice(1).join(' ') ?? '',
        role:       staff.role,
        sessions,
      });
    }

    if (reports.length === 0) {
      return NextResponse.json({ message: 'No staff found' }, { status: 200 });
    }

    /* ── 5. Generate Excel files ── */
    const excelFiles = await buildMonthlyReports(reports, year, month);

    /* ── 6. Send email via Resend ── */
    const resendKey = process.env.RESEND_API_KEY;
    const emailTo   = process.env.REPORT_EMAIL_TO;

    if (!resendKey || !emailTo) {
      // Return the first file for testing when email is not configured
      const first = excelFiles[0];
      return new NextResponse(first.buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${first.fileName}"`,
        },
      });
    }

    const resend = new Resend(resendKey);
    const HEB_MONTHS: Record<number, string> = {
      1: 'ינואר', 2: 'פברואר', 3: 'מרץ',   4: 'אפריל',
      5: 'מאי',   6: 'יוני',   7: 'יולי',   8: 'אוגוסט',
      9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
    };
    const monthName = HEB_MONTHS[month] ?? String(month);

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
      files: excelFiles.map(f => f.fileName),
    });

  } catch (err) {
    console.error('[monthly-excel]', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}

/* ── allow GET for manual browser testing ── */
export async function GET(req: NextRequest) {
  return POST(req);
}
