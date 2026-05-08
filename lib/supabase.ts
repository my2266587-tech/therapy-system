import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

/**
 * Browser-side Supabase client.
 *
 * `@supabase/ssr` already configures everything we need under the hood:
 *   - storage   → cookies (so the same session is visible to the proxy)
 *   - flowType  → 'pkce' (forced; cannot be overridden)
 *   - persistSession   defaults to true
 *   - autoRefreshToken defaults to true in browsers
 *   - detectSessionInUrl defaults to true in browsers (we still use a server
 *     callback at /auth/callback for the OAuth code exchange — the browser
 *     side never sees the code)
 *
 * Cookies written by Supabase have:
 *   path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 days
 * which means the session survives refresh, tab close, and browser restart
 * until either logout or genuine token expiry.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = !supabaseUrl.includes('placeholder');
