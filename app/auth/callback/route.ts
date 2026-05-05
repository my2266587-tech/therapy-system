import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code   = searchParams.get('code');
  const origin = request.nextUrl.origin;

  if (!code) {
    console.log('[auth/callback] no code in URL');
    return NextResponse.redirect(new URL('/login?error=no_code', origin));
  }

  // Collect cookie updates so we can apply them to whichever response we return
  const cookieUpdates: Array<{ name: string; value: string; options?: object }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll: (updates: any[]) => { updates.forEach(u => cookieUpdates.push(u)); },
      },
    }
  );

  // ── 1. Exchange OAuth code for session ──────────────────
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeErr) {
    console.error('[auth/callback] exchangeCodeForSession error:', exchangeErr.message);
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin));
  }

  // ── 2. Get the authenticated user ──────────────────────
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  console.log('[auth/callback] user.email  :', user?.email ?? '(none)');
  console.log('[auth/callback] userError   :', userError?.message ?? null);

  if (userError || !user?.email) {
    console.error('[auth/callback] could not retrieve user after exchange');
    return NextResponse.redirect(new URL('/login?error=no_user', origin));
  }

  // ── 3. Check authorized_users with service-role client ─
  //    (bypasses RLS — safe because this runs server-side only)
  const normalizedEmail = user.email.toLowerCase();
  console.log('[auth/callback] normalizedEmail:', normalizedEmail);
  console.log('[auth/callback] service role key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  type AuthRow = { email: string; role: string; is_active: boolean };
  let authRow:  AuthRow | null = null;
  let authErrMsg: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('authorized_users')
      .select('email, role, is_active')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authRow    = (data as AuthRow | null) ?? null;
    authErrMsg = error?.message ?? null;
  } catch (err: unknown) {
    authErrMsg = (err as Error).message;
  }

  console.log('[auth/callback] authRow :', authRow);
  console.log('[auth/callback] authErr :', authErrMsg);

  // ── 4. Decide ───────────────────────────────────────────
  let redirectPath = '/';

  if (authErrMsg) {
    console.error('[auth/callback] admin DB error — blocking user:', authErrMsg);
    await supabase.auth.signOut();
    redirectPath = '/login?error=unauthorized';
  } else if (!authRow) {
    console.log('[auth/callback] DECISION: not found in authorized_users →', normalizedEmail);
    await supabase.auth.signOut();
    redirectPath = '/login?error=unauthorized';
  } else if (!authRow.is_active) {
    console.log('[auth/callback] DECISION: is_active=false →', normalizedEmail);
    await supabase.auth.signOut();
    redirectPath = '/login?error=unauthorized';
  } else {
    console.log('[auth/callback] DECISION: access granted → role:', authRow.role, 'email:', normalizedEmail);
  }

  // ── 5. Build response with accumulated cookie updates ───
  const response = NextResponse.redirect(new URL(redirectPath, origin));
  cookieUpdates.forEach(({ name, value, options }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response.cookies.set(name, value, options as any);
  });

  return response;
}
