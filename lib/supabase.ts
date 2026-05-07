import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// createBrowserClient stores the session in cookies (so the proxy can refresh
// tokens server-side) and in localStorage (so reloads don't lose state).
//
// Explicit auth options:
//   - persistSession:    keep tokens between browser sessions (Gmail-style)
//   - autoRefreshToken:  silently swap an expired access token for a new one
//   - detectSessionInUrl:false — we use a server callback (/auth/callback)
//                          to do exchangeCodeForSession ourselves.
//   - flowType: 'pkce'   the secure OAuth flow our /auth/callback expects
export const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
    flowType:           'pkce',
  },
});

export const isSupabaseConfigured = !supabaseUrl.includes('placeholder');
