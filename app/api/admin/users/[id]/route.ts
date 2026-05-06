import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAdminUser } from '@/lib/getAdminUser';

/* PATCH /api/admin/users/[id] — update role or is_active */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (body.role !== undefined) {
    if (!['admin', 'staff'].includes(body.role)) {
      return NextResponse.json({ error: 'תפקיד לא חוקי' }, { status: 400 });
    }
    updates.role = body.role;
  }
  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכן' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('authorized_users')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });

  return NextResponse.json(data);
}

/* DELETE /api/admin/users/[id] — remove authorized user */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Safety: prevent an admin from deleting their own record
  const supabase = createServerClient();
  const { data: target } = await supabase
    .from('authorized_users')
    .select('email')
    .eq('id', id)
    .single();

  if (target?.email === admin.email) {
    return NextResponse.json({ error: 'לא ניתן למחוק את המשתמש הנוכחי' }, { status: 400 });
  }

  const { error } = await supabase
    .from('authorized_users')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
