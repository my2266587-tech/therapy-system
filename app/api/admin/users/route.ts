import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAdminUser } from '@/lib/getAdminUser';

/* GET /api/admin/users — list all authorized users */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  // select('*') — works regardless of whether the table has id/created_at or not
  const { data, error } = await supabase
    .from('authorized_users')
    .select('*')
    .order('created_at', { ascending: false })
    .order('email', { ascending: true }); // fallback order if created_at absent

  if (error) {
    console.log('[GET /api/admin/users] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/* POST /api/admin/users — add a new authorized user */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email: string = (body?.email ?? '').trim().toLowerCase();
  const role: string  = body?.role ?? 'staff';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 });
  }
  if (!['admin', 'staff'].includes(role)) {
    return NextResponse.json({ error: 'תפקיד לא חוקי' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('authorized_users')
    .insert({ email, role, is_active: true })
    .select('*')
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? 'המייל כבר קיים במערכת'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
