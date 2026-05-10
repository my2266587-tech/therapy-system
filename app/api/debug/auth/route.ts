/**
 * GET /api/debug/auth
 *
 * Diagnostic endpoint for debugging auth persistence.
 * Returns metadata about the current request's auth state — never tokens.
 *
 * Disabled in production unless NEXT_PUBLIC_AUTH_DEBUG=1 is set in the
 * environment. The whole purpose is to let the operator capture a
 * before/after snapshot in DevTools when reproducing the "logged out
 * after restart" bug.
 *
 * Sample shape:
 *   {
 *     ok: true,
 *     cookies: [{ name: 'sb-...-auth-token', present: true }, ...],
 *     getUser: { hasUser: true, email: '...' },
 *     getSession: { hasSession: true, expires_at: 1234567890 },
 *     env: { hasUrl: true, hasKey: true }
 *   }
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const enabled = process.env.NEXT_PUBLIC_AUTH_DEBUG === '1'
                || process.env.NODE_ENV === 'development';
  if (!enabled) {
    return NextResponse.json(
      { error: 'debug endpoint disabled — set NEXT_PUBLIC_AUTH_DEBUG=1' },
      { status: 404 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({
      ok: false,
      env: { hasUrl: !!url, hasKey: !!key },
      hint: 'Supabase env vars missing — this alone breaks auth.',
    });
  }

  const cookies = req.cookies.getAll().map(c => ({
    name:    c.name,
    /** Length only — never the value itself. */
    valueBytes: c.value.length,
    isAuth:  /^sb-.*auth-token/.test(c.name),
  }));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      // No-op setAll for the debug endpoint — we don't want to mutate
      // session state just by inspecting it.
      setAll() { /* intentional */ },
    },
  });

  let userInfo: { hasUser: boolean; email?: string; error?: string } = { hasUser: false };
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) userInfo = { hasUser: false, error: error.message };
    else       userInfo = { hasUser: !!data.user, email: data.user?.email };
  } catch (e) {
    userInfo = { hasUser: false, error: (e as Error).message };
  }

  let sessionInfo: { hasSession: boolean; expires_at?: number; error?: string } = { hasSession: false };
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) sessionInfo = { hasSession: false, error: error.message };
    else       sessionInfo = { hasSession: !!data.session, expires_at: data.session?.expires_at };
  } catch (e) {
    sessionInfo = { hasSession: false, error: (e as Error).message };
  }

  return NextResponse.json({
    ok:         true,
    request:    { path: req.nextUrl.pathname, host: req.nextUrl.host, protocol: req.nextUrl.protocol },
    cookies,
    getUser:    userInfo,
    getSession: sessionInfo,
    env:        { hasUrl: true, hasKey: true },
  });
}
