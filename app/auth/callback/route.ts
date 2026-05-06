import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /auth/callback
 *
 * Supabase redirects here after Google OAuth completes (PKCE flow).
 * The URL contains ?code=<one-time-code>. We exchange it for a real
 * session and write the resulting tokens into httpOnly cookies so the
 * user stays logged in across browser restarts.
 *
 * On success → redirect to the app root (or ?next= if provided).
 * On failure → redirect to /login with an error flag.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Code missing or exchange failed — send back to login
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
}
