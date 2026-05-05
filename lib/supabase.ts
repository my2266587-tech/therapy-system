import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// createBrowserClient stores the session in cookies (not localStorage),
// so Next.js middleware can read it server-side.
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = !supabaseUrl.includes('placeholder');
