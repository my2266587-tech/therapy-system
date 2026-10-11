import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Server code relies on the service role (bypasses RLS). No silent fallback to
// the anon key: with RLS on, that would just turn into confusing empty results.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function createServerClient() {
  if (!url) throw new Error('Supabase env var missing: NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Supabase env var missing: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}
