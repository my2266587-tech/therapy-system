/**
 * /api/summaries/sign-attachments
 *
 *   POST — given a list of storage paths, return a `{ [path]: signedUrl }`
 *          map. Used by the summaries list and the detail card to render
 *          attachment links — signed URLs expire (1h), so we resolve them
 *          fresh on each page load instead of persisting them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS, SIGNED_URL_TTL_SECONDS, friendlyStorageError } from '@/lib/storage';

const BUCKET = BUCKETS.patientDocuments;

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { paths?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const paths = Array.isArray(body.paths)
    ? body.paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
    : [];

  if (paths.length === 0) return NextResponse.json({ urls: {} });

  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('[summaries sign-attachments] createSignedUrls failed:', error.message);
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
