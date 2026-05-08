/**
 * /api/patients/[id]/documents/[docId]
 *
 *   DELETE — remove the file from Storage and the row from the DB.
 *            The row is only deleted if the storage object is gone (or was
 *            already missing), so the DB never loses the only handle on a
 *            still-existing file.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

const BUCKET = 'patient-documents';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: patientId, docId } = await params;
  const supabase = createServerClient();

  const { data: row, error: selErr } = await supabase
    .from('patient_documents')
    .select('id, patient_id, storage_path')
    .eq('id', docId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!row)   return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { error: rmErr } = await supabase.storage
    .from(BUCKET)
    .remove([row.storage_path]);

  // "not found" in storage is OK — proceed to delete the row anyway.
  if (rmErr && !/not.*found|no such/i.test(rmErr.message)) {
    return NextResponse.json(
      { error: `שגיאת מחיקה מהאחסון: ${rmErr.message}` },
      { status: 500 },
    );
  }

  const { error: delErr } = await supabase
    .from('patient_documents')
    .delete()
    .eq('id', docId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
