import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs on every request. Its ONLY job is to silently refresh the Supabase
 * access token when it has expired, and forward the (now-updated) cookies
 * onto the response so the browser sees the new tokens.
 *
 * It does NOT redirect to /login. Authorization checks live in the API
 * routes (getAdminUser) and in the page components themselves. This proxy
 * just keeps the session alive so users don't need to re-login every hour.
 *
 * Defensive choices:
 *   - If Supabase env vars are missing, skip the work entirely. Without
 *     credentials the SDK would throw, which would surface as a 500 on
 *     every page and look (to the user) like an auth break.
 *   - The /auth/callback route is excluded so OAuth code exchange runs
 *     uninterrupted — the proxy must never read or rewrite the PKCE
 *     code-verifier cookie mid-flow.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  // Start with a plain pass-through response; we may swap it below when
  // Supabase needs to write refreshed tokens into cookies.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror the cookies onto the request so any Server Component
        // rendered downstream sees the refreshed values.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        // Build a fresh response from the updated request, then attach the
        // Set-Cookie headers so the browser persists the new tokens.
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() triggers a token refresh when the access token has expired.
  // We discard the result — we never redirect based on auth state here.
  // Failures are swallowed so a transient Supabase blip doesn't 500 the app.
  try {
    await supabase.auth.getUser();
  } catch (e) {
    console.warn('[proxy] supabase.auth.getUser failed:', (e as Error).message);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on every path except Next.js internals, static files, and the
    // OAuth callback (the callback writes its own cookies and must not be
    // mediated by the proxy).
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
