/**
 * POST /api/admin/yemot-3part-summary-test
 *   Body: {
 *     "part1_path": "ivr2:/2/1/002.wav",   // patient name + current state
 *     "part2_path": "ivr2:/2/2/003.wav",   // topics raised + what we did
 *     "part3_path": "ivr2:/2/3/004.wav"    // tasks/progress/difficulty/next/notes
 *   }
 *
 *   Admin probe for the guided 3-recording flow with EXPLICIT paths. The
 *   actual pipeline (download → transcribe → split into fields → create one
 *   draft) lives in lib/yemot3part.ts so this route and the phone webhook
 *   share identical behaviour. Audio is never persisted or returned; the
 *   Yemot files are left in place.
 *
 * Auth (any one passes):
 *   - Bearer token of an active authorized user
 *   - Bearer CRON_SECRET
 *   - ?secret= / body secret matching YEMOT_WEBHOOK_SECRET
 *
 * Path safety: every path must start with `ivr2:/`.
 *
 * Response (success):
 *   { ok, draft_id, status, match_status,
 *     parts: { part1_chars, part2_chars, part3_chars }, call_date }
 * Response (failure): { ok:false, error } — no draft, no stored audio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { isValidYemotPath, YEMOT_PATH_PREFIX } from '@/lib/yemot';
import { processThreeParts } from '@/lib/yemot3part';

export const maxDuration = 120;

/* ── Auth (identical contract to the other probe routes) ─────────── */

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function hasValidWebhookSecret(req: NextRequest, bodySecret: string | null): boolean {
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) return false;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return bodySecret != null && bodySecret === expected;
}

async function authorize(req: NextRequest, bodySecret: string | null): Promise<boolean> {
  if (isCron(req)) return true;
  if (hasValidWebhookSecret(req, bodySecret)) return true;
  const user = await getAuthorizedUser(req);
  return Boolean(user);
}

interface Body {
  part1_path?: string;
  part2_path?: string;
  part3_path?: string;
  secret?: string;
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Empty body is fine if the secret is in the query string.
  }

  if (!(await authorize(req, body.secret ?? null))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const paths = [body.part1_path, body.part2_path, body.part3_path].map((p) => (p ?? '').trim());
  const labels = ['part1_path', 'part2_path', 'part3_path'];
  for (let i = 0; i < paths.length; i++) {
    if (!paths[i]) {
      return NextResponse.json(
        { ok: false, error: `${labels[i]} is required (must start with ${YEMOT_PATH_PREFIX})` },
        { status: 400 },
      );
    }
    if (!isValidYemotPath(paths[i])) {
      return NextResponse.json(
        { ok: false, error: `${labels[i]} must be a Yemot file path starting with ${YEMOT_PATH_PREFIX}` },
        { status: 400 },
      );
    }
  }

  const result = await processThreeParts({
    part1Path: paths[0],
    part2Path: paths[1],
    part3Path: paths[2],
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  const { ok, draft_id, status, match_status, parts, call_date } = result;
  return NextResponse.json({ ok, draft_id, status, match_status, parts, call_date });
}
