/**
 * /api/intake  (authed)
 *
 *   POST — create a NEW, blank intake form (not tied to any patient yet) and
 *          return its token. Used from the patients list page for onboarding a
 *          patient who does not exist in the system. Each call creates a fresh
 *          token (every prospective patient gets their own link).
 *
 * The patient record itself is created on submit (see [token]/submit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

function newToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, '') +
    crypto.randomUUID().replace(/-/g, '')
  );
}

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const token = newToken();

  const { error } = await supabase
    .from('intake_forms')
    .insert({ token, status: 'pending' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ token }, { status: 201 });
}
