/**
 * GET /api/admin/yemot-download-test?path=ivr2:/2/000.wav
 *
 *   Connectivity probe for the Yemot file API. Downloads a recording to
 *   memory and returns metadata ONLY — never the file bytes. Nothing is
 *   persisted (no disk, no Supabase). This exists so we can confirm the
 *   server can reach Yemot and pull a file before building the real
 *   transcription pipeline.
 *
 * Auth (any one of these passes):
 *   - Bearer token of an active authorized user (same as other admin routes)
 *   - Bearer CRON_SECRET
 *   - ?secret=<YEMOT_WEBHOOK_SECRET> query param — added ONLY on this probe
 *     route to make manual testing easy without minting a user JWT.
 *   Not public — a missing/wrong credential returns 401.
 *
 * Path safety:
 *   Only `ivr2:/` paths are accepted (no external URLs, no traversal).
 *
 * Response (success):
 *   { ok: true, downloaded: true, path, content_type, size_bytes }
 * Response (Yemot returned an error body instead of a file):
 *   { ok: false, downloaded: false, path, error }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { probeDownload, isValidYemotPath, YEMOT_PATH_PREFIX } from '@/lib/yemot';

export const maxDuration = 30;

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** True if ?secret= matches YEMOT_WEBHOOK_SECRET (probe-only shortcut). */
function hasValidWebhookSecret(req: NextRequest): boolean {
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) return false;
  return req.nextUrl.searchParams.get('secret') === expected;
}

async function authorize(req: NextRequest): Promise<boolean> {
  if (isCron(req)) return true;
  if (hasValidWebhookSecret(req)) return true;
  const user = await getAuthorizedUser(req);
  return Boolean(user);
}

export async function GET(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!path) {
    return NextResponse.json(
      { ok: false, error: `path is required (must start with ${YEMOT_PATH_PREFIX})` },
      { status: 400 },
    );
  }
  if (!isValidYemotPath(path)) {
    return NextResponse.json(
      { ok: false, error: `path must be a Yemot file path starting with ${YEMOT_PATH_PREFIX}` },
      { status: 400 },
    );
  }

  const result = await probeDownload(path);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, downloaded: false, path, error: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok:           true,
    downloaded:   true,
    path,
    content_type: result.contentType,
    size_bytes:   result.sizeBytes,
  });
}
