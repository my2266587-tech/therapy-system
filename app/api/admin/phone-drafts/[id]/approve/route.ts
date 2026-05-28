/**
 * POST /api/admin/phone-drafts/[id]/approve
 *
 *   Approves a draft. Atomically:
 *     1. Reads the draft.
 *     2. Inserts a new row into session_summaries with the draft's
 *        patient_id + the 8 content fields + call_date / times.
 *     3. Updates the draft → status='approved', approved_summary_id,
 *        approved_at, approved_by.
 *
 *   If the session_summaries insert fails, the draft is NOT touched —
 *   the user can try again. If step 3 fails (rare), we surface a clear
 *   error and the session_summaries row remains; cleanup is manual.
 *
 *   Idempotency: a draft that's already approved returns 409 with its
 *   existing approved_summary_id so the UI can navigate there.
 *
 * Auth: Bearer user token (CRON_SECRET also accepted for symmetry).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

export const maxDuration = 30;

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function calcDuration(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const d = (eh * 60 + em) - (sh * 60 + sm);
  return Number.isFinite(d) && d > 0 ? d : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let userEmail: string | null = null;
    if (!isCron(req)) {
      const user = await getAuthorizedUser(req);
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      userEmail = user.email ?? null;
    }

    const { id } = await params;
    const supabase = createServerClient();

    // 1. Load the draft.
    const { data: draft, error: dErr } = await supabase
      .from('phone_summary_drafts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (dErr)   throw new Error(`fetch draft: ${dErr.message}`);
    if (!draft) return NextResponse.json({ error: 'טיוטה לא נמצאה' }, { status: 404 });

    if (draft.status === 'approved') {
      return NextResponse.json(
        {
          error: 'הטיוטה כבר אושרה.',
          approved_summary_id: draft.approved_summary_id,
        },
        { status: 409 },
      );
    }
    if (!draft.matched_patient_id) {
      return NextResponse.json(
        { error: 'אי אפשר לאשר טיוטה בלי מטופלת משויכת. בחרי מטופלת ונסי שוב.' },
        { status: 400 },
      );
    }

    // 2. Insert into session_summaries.
    const summaryRow = {
      patient_id:        draft.matched_patient_id,
      session_id:        null,
      date:              draft.call_date ?? new Date().toISOString().slice(0, 10),
      start_time:        draft.call_start_time ?? null,
      end_time:          draft.call_end_time ?? null,
      duration_minutes:  calcDuration(draft.call_start_time, draft.call_end_time),
      current_state:     draft.current_state,
      main_topics:       draft.main_topics,
      treatment_actions: draft.treatment_actions,
      next_steps:        draft.next_steps,
      tasks_given:       draft.tasks_given,
      progress:          draft.progress,
      difficulties:      draft.difficulties,
      notes:             draft.notes,
    };
    const { data: created, error: insErr } = await supabase
      .from('session_summaries')
      .insert(summaryRow)
      .select('id')
      .single();
    if (insErr) throw new Error(`session_summaries insert: ${insErr.message}`);

    // 3. Mark draft approved + link.
    const { data: approved, error: updErr } = await supabase
      .from('phone_summary_drafts')
      .update({
        status:              'approved',
        approved_summary_id: created.id,
        approved_at:         new Date().toISOString(),
        approved_by:         userEmail ?? 'system',
        updated_at:          new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, matched_patient:matched_patient_id(full_name)')
      .single();
    if (updErr) {
      // Step 3 failed but step 2 succeeded. Don't roll back — surface
      // the linkage in the error so a human can fix it. Extremely rare.
      console.error('[phone-drafts approve] step-3 update failed', updErr);
      return NextResponse.json(
        {
          error: `הסיכום נוצר (id=${created.id}) אבל לא הצלחתי לסמן את הטיוטה כמאושרת: ${updErr.message}`,
          approved_summary_id: created.id,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      draft: approved,
      approved_summary_id: created.id,
    });
  } catch (err) {
    console.error('[phone-drafts approve POST]', { message: (err as Error)?.message });
    return NextResponse.json(
      { error: (err as Error)?.message ?? String(err) },
      { status: 500 },
    );
  }
}
