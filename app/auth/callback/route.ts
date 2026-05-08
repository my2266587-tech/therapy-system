import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /auth/callback
 *
 * Supabase redirects here after Google OAuth completes (PKCE flow).
 * The URL contains ?code=<one-time-code>. We exchange it for a real
 * session and attach the resulting Set-Cookie headers DIRECTLY to the
 * redirect response we return.
 *
 * Why this pattern (and not `cookies().set()`):
 *   In Next.js Route Handlers, mutations done through the `cookies()` helper
 *   are not always merged into a manually constructed `NextResponse.redirect()`.
 *   Writing through `response.cookies.set(...)` guarantees the Set-Cookie
 *   headers ride on the redirect — that's what keeps the user logged in
 *   across refresh, tab close, and browser restart.
 *
 * On success → redirect to the app root (or ?next= if provided).
 * On failure → redirect to /login with an error flag.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  // Build the response we plan to return, BEFORE creating the supabase client,
  // so the cookie adapter can write directly into it.
  const response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
  }

  return response;
}
