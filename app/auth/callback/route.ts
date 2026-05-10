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
 * Diagnostic logging is intentionally verbose. The persistence symptom
 * (logout-on-restart) most often traces back here — either the
 * exchange fails silently or the auth-token cookies don't make it onto
 * the redirect response. Each log line is named so we can spot it in
 * Vercel function logs without grepping.
 */

const ONE_YEAR_SECONDS  = 365 * 24 * 60 * 60;

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  console.log('[auth/callback] received', {
    origin,
    next,
    hasCode: !!code,
    cookieNames: req.cookies.getAll().map(c => c.name),
  });

  if (!code) {
    console.warn('[auth/callback] missing code — redirecting to /login?error=missing_code');
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  const response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            // Force persistent cookies. Some Supabase SDK versions ship
            // sane defaults (maxAge 400 days, sameSite 'lax', httpOnly
            // false) but if a browser sees no Max-Age it treats the
            // cookie as a Session cookie and drops it on browser close.
            // Belt-and-suspenders: explicitly enforce maxAge here when
            // it's a token (not a deletion).
            const isDeletion = options?.maxAge === 0;
            const finalOptions = isDeletion
              ? options
              : {
                  ...options,
                  maxAge:    options?.maxAge   ?? ONE_YEAR_SECONDS,
                  sameSite:  options?.sameSite ?? 'lax',
                  path:      options?.path     ?? '/',
                  httpOnly:  options?.httpOnly ?? false,
                  secure:    options?.secure   ?? (origin.startsWith('https://')),
                };
            response.cookies.set(name, value, finalOptions);
          }
          console.log('[auth/callback] setAll', {
            count: cookiesToSet.length,
            names: cookiesToSet.map(c => c.name),
            // Don't log values (tokens). Log persistence-affecting attrs.
            attrs: cookiesToSet.map(c => ({
              name:     c.name,
              maxAge:   c.options?.maxAge,
              sameSite: c.options?.sameSite,
              secure:   c.options?.secure,
              httpOnly: c.options?.httpOnly,
            })),
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession FAILED', {
      message: error.message,
      status:  error.status,
      name:    error.name,
    });
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
  }

  console.log('[auth/callback] exchange OK', {
    user:           data.session?.user?.email,
    expiresIn:      data.session?.expires_in,
    refreshPresent: !!data.session?.refresh_token,
    responseSetCookieHeader: response.headers.get('set-cookie')?.length ?? 0,
  });

  return response;
}
