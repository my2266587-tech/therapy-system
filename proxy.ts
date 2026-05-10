import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs on every request. Its ONLY job is to silently refresh the Supabase
 * access token when it has expired, and forward the (now-updated) cookies
 * onto the response so the browser sees the new tokens.
 *
 * It does NOT redirect to /login. Authorization checks live in the API
 * routes (getAdminUser) and in the page components themselves.
 *
 * Defensive choices:
 *   - If Supabase env vars are missing, skip the work entirely.
 *   - The /auth/callback route is excluded so OAuth code exchange runs
 *     uninterrupted.
 *   - Refreshed cookies inherit the same persistence enforcement as the
 *     callback route (Max-Age set, never a Session cookie).
 *   - Logging is opt-in via NEXT_PUBLIC_AUTH_DEBUG=1 to avoid spamming
 *     production logs. The auth/callback route always logs because it
 *     fires once per login.
 */

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const DEBUG = process.env.NEXT_PUBLIC_AUTH_DEBUG === '1';

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isHttps = request.nextUrl.protocol === 'https:';

  let response = NextResponse.next({ request });
  let didRefresh = false;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        didRefresh = true;
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          const isDeletion = options?.maxAge === 0;
          const finalOptions = isDeletion
            ? options
            : {
                ...options,
                maxAge:   options?.maxAge   ?? ONE_YEAR_SECONDS,
                sameSite: options?.sameSite ?? 'lax',
                path:     options?.path     ?? '/',
                httpOnly: options?.httpOnly ?? false,
                secure:   options?.secure   ?? isHttps,
              };
          response.cookies.set(name, value, finalOptions);
        }
        if (DEBUG) {
          console.log('[proxy] refreshed', {
            path,
            count: cookiesToSet.length,
            names: cookiesToSet.map(c => c.name),
          });
        }
      },
    },
  });

  let user: { email?: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch (e) {
    console.warn('[proxy] supabase.auth.getUser failed:', (e as Error).message);
  }

  if (DEBUG) {
    console.log('[proxy]', {
      path,
      hasSession: !!user,
      email:      user?.email ?? null,
      didRefresh,
      cookieNames: request.cookies.getAll().map(c => c.name),
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
