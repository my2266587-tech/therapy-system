/**
 * /api/staff/[id]/documents/[docId]
 *
 *   DELETE — remove the file from Storage and the row from the DB.
 *            Tolerates "object not found" in storage (already gone),
 *            mirrors the pattern used by patient documents.
 *
 * Auth: Bearer token of an active authorized user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS, friendlyStorageError } from '@/lib/storage';

const BUCKET = BUCKETS.staffDocuments;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: staffId, docId } = await params;
  const supabase = createServerClient();

  const { data: row, error: selErr } = await supabase
    .from('staff_documents')
    .select('id, staff_id, storage_path')
    .eq('id', docId)
    .eq('staff_id', staffId)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!row)   return NextResponse.json({ error: 'מסמך לא נמצא' }, { status: 404 });

  const { error: rmErr } = await supabase.storage
    .from(BUCKET)
    .remove([row.storage_path]);

  // Object-not-found in storage is OK — proceed to delete the row.
  if (rmErr && !/not.*found|no such/i.test(rmErr.message)) {
    console.error('[staff documents DELETE] storage.remove failed:', rmErr.message);
    return NextResponse.json(
      { error: friendlyStorageError(rmErr.message) },
      { status: 500 },
    );
  }

  const { error: delErr } = await supabase
    .from('staff_documents')
    .delete()
    .eq('id', docId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
