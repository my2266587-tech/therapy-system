import { createServerClient } from '@/lib/supabaseServer';
import { NextRequest } from 'next/server';

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Verifies the Bearer token in the Authorization header, then checks that
 * the user's email exists in authorized_users with is_active=true and role='admin'.
 *
 * Email comparison is case-insensitive (.ilike) and both sides are trimmed.
 * Returns null on any failure — callers should respond 401.
 */
export async function getAdminUser(req: NextRequest): Promise<AdminUser | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[getAdminUser] DENIED — no Bearer token in request');
    return null;
  }

  const token = authHeader.slice(7);
  const supabase = createServerClient();

  // Validate the JWT with Supabase Auth (GoTrue) and get the user's email.
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user?.email) {
    console.log('[getAdminUser] DENIED — getUser failed:', userError?.message ?? 'no email on user object');
    return null;
  }

  const rawEmail      = user.email;
  const normalizedEmail = rawEmail.toLowerCase().trim();
  console.log('[getAdminUser] Google email:', rawEmail, '→ normalized:', normalizedEmail);

  // Look up the authorized_users row using case-insensitive email match.
  // maybeSingle() returns { data: null, error: null } when no row found,
  // whereas single() returns { data: null, error: ... } which we were silently
  // ignoring before.
  const { data: authRow, error: dbError } = await supabase
    .from('authorized_users')
    .select('role, is_active')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  console.log('[getAdminUser] authRow:', JSON.stringify(authRow), '| dbError:', dbError?.message ?? null);

  if (dbError) {
    console.log('[getAdminUser] DENIED — DB error querying authorized_users');
    return null;
  }

  if (!authRow) {
    console.log('[getAdminUser] DENIED — email not found in authorized_users');
    return null;
  }

  if (!authRow.is_active) {
    console.log('[getAdminUser] DENIED — user is inactive');
    return null;
  }

  if (authRow.role !== 'admin') {
    console.log('[getAdminUser] DENIED — role is', authRow.role, '(not admin)');
    return null;
  }

  console.log('[getAdminUser] GRANTED for', normalizedEmail);
  return { id: user.id, email: normalizedEmail, role: authRow.role };
}

/**
 * Same as getAdminUser but allows any active authorized user (admin or staff).
 */
export async function getAuthorizedUser(req: NextRequest): Promise<AdminUser | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[getAuthorizedUser] DENIED — no Bearer token');
    return null;
  }

  const token = authHeader.slice(7);
  const supabase = createServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user?.email) {
    console.log('[getAuthorizedUser] DENIED — getUser failed:', userError?.message ?? 'no email');
    return null;
  }

  const normalizedEmail = user.email.toLowerCase().trim();
  console.log('[getAuthorizedUser] normalized email:', normalizedEmail);

  const { data: authRow, error: dbError } = await supabase
    .from('authorized_users')
    .select('role, is_active')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  console.log('[getAuthorizedUser] authRow:', JSON.stringify(authRow), '| dbError:', dbError?.message ?? null);

  if (dbError || !authRow || !authRow.is_active) return null;

  return { id: user.id, email: normalizedEmail, role: authRow.role };
}
