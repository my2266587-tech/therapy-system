/**
 * GET /api/reports/monthly-excel/[staff_id]?year=2026&month=2
 *
 *   On-demand monthly hours report for a single staff member, filled
 *   into the Excel template at public/templates/monthly-report-template.xlsx.
 *
 *   Auth: Bearer token of an active authorized user.
 *   Output: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
 *           Content-Disposition: attachment, filename includes the staff
 *           name + year-month.
 *
 *   Pipeline:
 *     1. Auth.
 *     2. Validate the route param + query string.
 *     3. Load staff row.
 *     4. Pull all completed sessions in that month for patients whose
 *        primary therapist is this staff member.
 *     5. Hand the bundle to buildMonthlyReport(...) and stream the bytes.
 *
 *   The cron-driven /api/reports/monthly-excel route stays as is. This
 *   route is the per-staff on-demand button hooked into the new
 *   /reports/monthly UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { buildMonthlyReport, type SessionSlot } from '@/lib/reports/buildFromTemplate';
import type { StaffRole } from '@/types';

/** Generation can take a couple of seconds when there are many sessions
 *  and the template is large. 60s is plenty. */
export const maxDuration = 60;

function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end:   `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ staff_id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staff_id: staffId } = await params;
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

  // 1. Staff row
  const { data: staff, error: sErr } = await supabase
    .from('staff')
    .select('id, full_name, role, employee_number')
    .eq('id', staffId)
    .maybeSingle();
  if (sErr)   return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!staff) return NextResponse.json({ error: 'איש צוות לא נמצא' }, { status: 404 });

  // 2. Sessions for the month, joined to patient. We use the same
  //    "primary therapist" link as the existing cron route — sessions
  //    are filtered through patients.staff_id.
  const { start, end } = monthRange(year, month);
  const { data: rawSessions, error: secErr } = await supabase
    .from('sessions')
    .select('date, start_time, end_time, notes, status, patient:patient_id(full_name, staff_id)')
    .gte('date', start)
    .lte('date', end)
    .eq('status', 'completed')
    .order('date',       { ascending: true })
    .order('start_time', { ascending: true });
  if (secErr) return NextResponse.json({ error: secErr.message }, { status: 500 });

  type RawSession = {
    date: string; start_time: string; end_time: string; notes: string | null;
    status: string;
    patient: { full_name: string; staff_id: string | null } | null;
  };
  const sessions: SessionSlot[] = ((rawSessions ?? []) as unknown as RawSession[])
    .filter(s => s.patient?.staff_id === staffId)
    .map(s => ({
      date:         s.date,
      start_time:   s.start_time,
      end_time:     s.end_time,
      patient_name: s.patient?.full_name ?? null,
      notes:        s.notes,
    }));

  // 3. Generate
  let result;
  try {
    result = await buildMonthlyReport({
      staff: {
        full_name:       staff.full_name,
        role:            staff.role as StaffRole,
        employee_number: staff.employee_number ?? null,
      },
      sessions,
      year,
      month,
    });
  } catch (e) {
    console.error('[reports monthly-excel staff_id] buildMonthlyReport failed:', e);
    return NextResponse.json(
      { error: `שגיאה ביצירת הדוח: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  // 4. Stream the bytes
  return new NextResponse(result.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Cache-Control':       'no-store',
      'X-Report-Sessions':   String(result.stats.sessionCount),
      'X-Report-Days':       String(result.stats.daysCovered),
      'X-Report-Skipped':    String(result.stats.daysSkippedExtra),
    },
  });
}
