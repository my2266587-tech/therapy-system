/**
 * /api/trips/delete-receipt
 *
 *   POST — remove a storage object that was previously uploaded as a trip
 *          receipt. Called when the user clears or replaces the receipt in
 *          the trip form, or deletes the trip itself. Object-not-found is
 *          treated as success so the form can always clear its local state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS, friendlyStorageError } from '@/lib/storage';

const BUCKET = BUCKETS.patientDocuments;

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const path = typeof body.path === 'string' ? body.path : '';
  if (!path) return NextResponse.json({ error: 'שדה "path" חסר' }, { status: 400 });

  // Defensive: only allow deletions within the trips/ prefix to keep this
  // endpoint from being repurposed against unrelated documents.
  if (!path.startsWith('trips/')) {
    return NextResponse.json({ error: 'נתיב לא חוקי' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error && !/not.*found|no such/i.test(error.message)) {
    console.error('[trips delete-receipt] storage.remove failed:', error.message);
    return NextResponse.json(
      { error: friendlyStorageError(error.message) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
