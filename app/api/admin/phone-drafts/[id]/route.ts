/**
 * PATCH /api/admin/phone-drafts/[id]
 *
 *   Edits a draft in place. Used both for the "שמירת טיוטה" button on
 *   the pending-approvals UI (user updates fields without approving)
 *   AND for "select a patient" — when matched_patient_id is set, we
 *   automatically promote the draft from needs_match → draft_ready.
 *
 *   Whitelisted columns only; nothing outside the list below can be
 *   touched here. Approval is its own route (/approve).
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

const EDITABLE = [
  'spoken_patient_name',
  'matched_patient_id',
  'current_state',
  'main_topics',
  'treatment_actions',
  'next_steps',
  'tasks_given',
  'progress',
  'difficulties',
  'notes',
  'call_date',
  'call_start_time',
  'call_end_time',
] as const;
type EditableKey = typeof EDITABLE[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isCron(req)) {
      const user = await getAuthorizedUser(req);
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 }); }

    const supabase = createServerClient();

    // Fetch current row so we know what to do about status transitions.
    const { data: current, error: fetchErr } = await supabase
      .from('phone_summary_drafts')
      .select('id, status, matched_patient_id, match_status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw new Error(`fetch: ${fetchErr.message}`);
    if (!current) return NextResponse.json({ error: 'טיוטה לא נמצאה' }, { status: 404 });
    if (current.status === 'approved') {
      return NextResponse.json(
        { error: 'הטיוטה כבר אושרה — אי אפשר לערוך אותה.' },
        { status: 409 },
      );
    }

    const patch: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      if (k in body) {
        patch[k] = body[k as EditableKey] ?? null;
      }
    }
    // updated_at is auto via trigger if one exists; if not, set explicitly.
    patch.updated_at = new Date().toISOString();

    // Status auto-promotion: if matched_patient_id is being set (or is
    // already set in the row), bump status to draft_ready + match_status
    // to matched. This way the UI's "select patient" button doesn't have
    // to also know to fix the status.
    const finalMatchedId = (
      'matched_patient_id' in patch
        ? patch.matched_patient_id
        : current.matched_patient_id
    ) as string | null;
    if (finalMatchedId) {
      patch.match_status = 'matched';
      if (current.status === 'needs_match' || current.status === 'failed') {
        patch.status = 'draft_ready';
      }
    } else if ('matched_patient_id' in patch && !patch.matched_patient_id) {
      // Explicit clear → revert to needs_match.
      patch.match_status = 'not_found';
      patch.status = 'needs_match';
    }

    const { data, error: updErr } = await supabase
      .from('phone_summary_drafts')
      .update(patch)
      .eq('id', id)
      .select('*, matched_patient:matched_patient_id(full_name)')
      .single();
    if (updErr) throw new Error(`update: ${updErr.message}`);

    return NextResponse.json({ draft: data });
  } catch (err) {
    console.error('[phone-drafts PATCH]', { message: (err as Error)?.message });
    return NextResponse.json(
      { error: (err as Error)?.message ?? String(err) },
      { status: 500 },
    );
  }
}
