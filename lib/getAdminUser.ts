import { createServerClient } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Verifies the Bearer token in the Authorization header, then looks up the
 * user's email in authorized_users (case-insensitive, trimmed).
 *
 * Returns null on any failure — callers should respond 401/403.
 * Logs only the denial reason, never the email or token (no PII in logs).
 */
async function resolveUser(req: NextRequest, tag: string): Promise<AdminUser | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabase = createServerClient();

  // Validate the JWT with Supabase Auth (GoTrue) and get the user's email.
  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.slice(7));
  if (userError || !user?.email) {
    console.warn(`[${tag}] denied — invalid token`);
    return null;
  }

  const email = user.email.toLowerCase().trim();

  // maybeSingle() returns { data: null, error: null } when no row matches.
  const { data: authRow, error: dbError } = await supabase
    .from('authorized_users')
    .select('role, is_active')
    .ilike('email', email)
    .maybeSingle();

  if (dbError) {
    console.error(`[${tag}] denied — authorized_users query failed:`, dbError.message);
    return null;
  }
  if (!authRow || !authRow.is_active) {
    console.warn(`[${tag}] denied — not an active authorized user`);
    return null;
  }

  return { id: user.id, email, role: authRow.role };
}

/** Any active authorized user whose role is 'admin'. */
export async function getAdminUser(req: NextRequest): Promise<AdminUser | null> {
  const user = await resolveUser(req, 'getAdminUser');
  if (user && user.role !== 'admin') {
    console.warn('[getAdminUser] denied — role is not admin');
    return null;
  }
  return user;
}

/** Any active authorized user (admin or staff). */
export async function getAuthorizedUser(req: NextRequest): Promise<AdminUser | null> {
  return resolveUser(req, 'getAuthorizedUser');
}
