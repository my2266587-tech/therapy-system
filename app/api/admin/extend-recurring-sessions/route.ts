/**
 * POST /api/admin/extend-recurring-sessions
 *
 *   One-shot helper. For every currently-planned future session it
 *   creates up to 7 weekly copies forward (same patient, weekday,
 *   start_time, end_time, notes, duration) so the clinic ends up with
 *   a ~2-month series for each patient.
 *
 *   Idempotent — a (patient_id, date, start_time) triple that already
 *   exists is skipped. Safe to re-trigger if the user later adds new
 *   planned sessions and wants them propagated too.
 *
 * Auth:
 *   Bearer ${CRON_SECRET}.
 *
 * Query:
 *   ?weeks=N    optional, default 7 (number of weekly copies to add
 *               after each existing session). Capped to 26 (~half a year).
 *
 * Response:
 *   { ok, basedOn, generated, skipped, weeks }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** Today's date in Israel as YYYY-MM-DD. */
function todayInIsrael(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const pick = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Add N days to a YYYY-MM-DD string via UTC math (no TZ shift). */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'CRON_SECRET לא מוגדר.' }, { status: 500 });
    }
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const rawWeeks = Number(sp.get('weeks') ?? '7');
    const weeks = Number.isFinite(rawWeeks)
      ? Math.min(26, Math.max(1, Math.floor(rawWeeks)))
      : 7;

    const supabase = createServerClient();
    const today = todayInIsrael();

    // Source set: every session that represents an ongoing weekly slot —
    // 'planned' (the next live appointment) and 'completed' (a session
    // that actually took place, evidence the slot is real). 'cancelled'
    // and 'no_show' are excluded because they don't necessarily imply
    // the patient still wants that weekly time. No date filter — past
    // sessions are valid pattern carriers; we just skip generating any
    // copy whose computed date lands before today.
    const { data: source, error: srcErr } = await supabase
      .from('sessions')
      .select('id, patient_id, date, start_time, end_time, status, notes, duration_minutes')
      .in('status', ['planned', 'completed']);
    if (srcErr) throw new Error(`fetch source sessions: ${srcErr.message}`);

    // Existing dedup key set across ALL planned sessions (past + future)
    // so we never insert a clash if the clinic already has it.
    const { data: existingAll, error: existErr } = await supabase
      .from('sessions')
      .select('patient_id, date, start_time');
    if (existErr) throw new Error(`fetch all sessions: ${existErr.message}`);

    const keys = new Set<string>(
      (existingAll ?? []).map(r => `${r.patient_id}|${r.date}|${r.start_time}`),
    );

    type Insert = {
      patient_id:       string;
      date:             string;
      start_time:       string;
      end_time:         string;
      status:           string;
      notes:            string | null;
      duration_minutes: number | null;
    };

    const toInsert: Insert[] = [];
    let skipped = 0;

    let skippedPast = 0;

    for (const s of (source ?? [])) {
      const row = s as {
        patient_id: string; date: string; start_time: string;
        end_time: string; notes: string | null; duration_minutes: number | null;
      };
      for (let n = 1; n <= weeks; n++) {
        const newDate = addDays(row.date, n * 7);
        // Never project into the past — if the source session is old,
        // its earliest weekly copies will be < today; skip those and
        // let later iterations (which land >= today) be inserted.
        if (newDate < today) { skippedPast++; continue; }
        const key = `${row.patient_id}|${newDate}|${row.start_time}`;
        if (keys.has(key)) { skipped++; continue; }
        keys.add(key);
        toInsert.push({
          patient_id:       row.patient_id,
          date:             newDate,
          start_time:       row.start_time,
          end_time:         row.end_time,
          status:           'planned',
          notes:            row.notes,
          duration_minutes: row.duration_minutes,
        });
      }
    }

    if (toInsert.length > 0) {
      // Supabase JS does the chunking — single insert call is fine for
      // ~hundreds of rows. If it grows past a few thousand, batch by 500.
      const { error: insErr } = await supabase.from('sessions').insert(toInsert);
      if (insErr) throw new Error(`insert: ${insErr.message}`);
    }

    return NextResponse.json({
      ok:           true,
      basedOn:      (source ?? []).length,
      generated:    toInsert.length,
      skipped,
      skippedPast,
      weeks,
    });

  } catch (err) {
    console.error('[extend-recurring-sessions]', {
      message: (err as Error)?.message,
      stack:   (err as Error)?.stack,
    });
    return NextResponse.json(
      { error: (err as Error)?.message ?? String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
