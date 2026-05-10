/**
 * /api/staff/[id]/patients
 *
 *   GET    — list patients linked to this staff member.
 *   POST   — replace the link set, body { patient_ids: string[] }.
 *            Idempotent — diffs against current state, only inserts
 *            new pairs and deletes removed pairs.
 *   DELETE — unlink a single patient. Body { patient_id: string }.
 *
 * Auth: Bearer token of an active authorized user.
 *
 * The relationship lives only in the join table `staff_patients` —
 * never as an array on either side of the relationship.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: staffId } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('staff_patients')
    .select('patient_id, created_at, patient:patient_id(id, full_name, phone, status)')
    .eq('staff_id', staffId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the joined patient row so the client gets a clean list.
  type Joined = { patient_id: string; created_at: string; patient: { id: string; full_name: string; phone: string | null; status: string } | null };
  const rows = (data ?? []) as unknown as Joined[];
  const patients = rows
    .map(r => r.patient ? { ...r.patient, linked_at: r.created_at } : null)
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'));

  return NextResponse.json(patients);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: staffId } = await params;
  const body = await req.json().catch(() => null) as { patient_ids?: unknown } | null;
  const incoming = Array.isArray(body?.patient_ids)
    ? (body!.patient_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : null;
  if (!incoming) {
    return NextResponse.json({ error: 'patient_ids חסר או אינו מערך מחרוזות' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Verify staff exists
  const { data: staff } = await supabase.from('staff').select('id').eq('id', staffId).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'איש צוות לא נמצא' }, { status: 404 });

  // Diff against current state
  const { data: existing } = await supabase
    .from('staff_patients').select('patient_id').eq('staff_id', staffId);
  const existingIds = new Set(((existing ?? []) as Array<{ patient_id: string }>).map(r => r.patient_id));
  const incomingSet = new Set(incoming);

  const toInsert = incoming.filter(id => !existingIds.has(id));
  const toDelete = [...existingIds].filter(id => !incomingSet.has(id));

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from('staff_patients')
      .insert(toInsert.map(pid => ({ staff_id: staffId, patient_id: pid })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('staff_patients')
      .delete()
      .eq('staff_id', staffId)
      .in('patient_id', toDelete);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({
    linked:    incoming.length,
    added:     toInsert.length,
    removed:   toDelete.length,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: staffId } = await params;
  const body = await req.json().catch(() => null) as { patient_id?: unknown } | null;
  const patientId = typeof body?.patient_id === 'string' ? body.patient_id : null;
  if (!patientId) {
    return NextResponse.json({ error: 'patient_id חסר' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('staff_patients')
    .delete()
    .eq('staff_id',   staffId)
    .eq('patient_id', patientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
