import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client — never imported by client components.
 * Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 * With RLS enabled, falling back to the anon key without a session JWT
 * would block all queries — so we throw instead of silently degrading.
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[supabase-server] SUPABASE_SERVICE_ROLE_KEY is required. ' +
      'Add it to .env.local — never prefix it with NEXT_PUBLIC_.'
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
