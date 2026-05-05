import { createClient } from '@supabase/supabase-js';

/**
 * Server-only admin client — uses SUPABASE_SERVICE_ROLE_KEY.
 * Bypasses RLS entirely. NEVER import this in client components.
 * Throws at call time if the key is missing so mis-configuration is obvious.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Check .env.local — the service role key must never be prefixed with NEXT_PUBLIC_.'
    );
  }

  return createClient(url, key, {
    auth: {
      // Disable auto session management — this client is for server-side DB access only
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}
