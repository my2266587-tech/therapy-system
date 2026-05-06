import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs on every request. Its ONLY job is to silently refresh the Supabase
 * access token when it has expired, then forward the (now-updated) cookies.
 *
 * It does NOT redirect to /login. Authorization checks live in the API routes
 * (getAdminUser) and in the page component (settings/users). This proxy
 * just keeps the session alive so users don't need to re-login every hour.
 */
export async function proxy(request: NextRequest) {
  // Start with a plain pass-through response; we may swap it below when
  // Supabase needs to write refreshed tokens into cookies.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write the cookies onto the outgoing request object so that
          // Server Components rendered in the same pass can read them.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Also write them onto the response so the browser receives them.
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() triggers a token refresh when the access token has expired.
  // We discard the result — we never redirect based on auth state here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on every path except Next.js internals and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
