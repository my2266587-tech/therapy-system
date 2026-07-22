/**
 * /api/trips/sign-receipts
 *
 *   POST — given a list of trip receipt storage paths, return a
 *          `{ [path]: signedUrl }` map. Used by the trips list to render
 *          the receipt indicator link and by the employer export, which
 *          embeds the links in the Excel/PDF report.
 *
 * `expires_in` (seconds) is optional: the list view uses the default 1h,
 * while the export asks for a long-lived URL (up to 30 days) so the link
 * inside the report still works when the employer opens it later.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS, SIGNED_URL_TTL_SECONDS, friendlyStorageError } from '@/lib/storage';

const BUCKET = BUCKETS.patientDocuments;
const MAX_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { paths?: unknown; expires_in?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only trip receipt paths may be signed here.
  const paths = Array.isArray(body.paths)
    ? body.paths.filter(
        (p): p is string => typeof p === 'string' && p.startsWith('trips/'),
      )
    : [];

  if (paths.length === 0) return NextResponse.json({ urls: {} });

  const requested = typeof body.expires_in === 'number' ? body.expires_in : NaN;
  const ttl = Number.isFinite(requested)
    ? Math.min(Math.max(Math.floor(requested), 60), MAX_TTL_SECONDS)
    : SIGNED_URL_TTL_SECONDS;

  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, ttl);

  if (error) {
    console.error('[trips sign-receipts] createSignedUrls failed:', error.message);
    return NextResponse.json(
      { error: friendlyStorageError(error.message) },
      { status: 500 },
    );
  }

  const urls: Record<string, string> = {};
  for (const r of data ?? []) {
    if (r.path && r.signedUrl) urls[r.path] = r.signedUrl;
  }
  return NextResponse.json({ urls });
}
