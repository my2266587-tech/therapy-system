import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// createBrowserClient stores the session in both localStorage AND cookies,
// enabling the middleware to refresh tokens server-side without forcing re-login.
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = !supabaseUrl.includes('placeholder');
