/**
 * GET | POST /api/phone/yemot-process-latest
 *
 *   Public webhook for Yemot's "/2/9 confirm" step. It takes the LATEST
 *   recording from each of the three step folders and runs the shared
 *   3-part pipeline (transcribe → split into fields → create one draft).
 *
 *   Folders: ivr2:/2/1  ivr2:/2/2  ivr2:/2/3
 *   "Latest" = highest digit-named .wav (latestWav in lib/yemot.ts).
 *
 *   Audio is downloaded to memory only (inside processThreeParts), used for
 *   transcription, and discarded — nothing is written to disk or Supabase.
 *   The Yemot files are left in place (deletion is a later step).
 *
 * Modes:
 *   ?dry_run=true  → resolve the three paths and return them. No transcribe,
 *                    no draft, no audio download.
 *   (no dry_run)   → real processing via processThreeParts → creates a draft.
 *
 * Security:
 *   YEMOT_WEBHOOK_SECRET via `?secret=` query OR a `secret` body field.
 *   Missing / wrong secret → 401.
 *
 * Response (dry-run):
 *   { ok: true, dry_run: true, found: { part1, part2, part3 } }
 * Response (processed):
 *   { ok: true, processed: true, found, draft_id,
 *     status, match_status, parts, call_date,
 *     redirect: "/summaries/phone-pending" }
 * Response (failure):
 *   { ok: false, error }   (which folder/part failed is named in the message)
 *
 * Logging tag: [yemot-process-latest]
 */

import { NextRequest, NextResponse } from 'next/server';
import { latestWav } from '@/lib/yemot';
import { processThreeParts } from '@/lib/yemot3part';

export const maxDuration = 120;

const TAG = '[yemot-process-latest]';

/** The three step folders, in part order. */
const PART_DIRS = ['ivr2:/2/1', 'ivr2:/2/2', 'ivr2:/2/3'] as const;

interface Body {
  secret?: string;
  dry_run?: boolean | string;
}

type Found = Record<'part1' | 'part2' | 'part3', string>;

function hasValidSecret(req: NextRequest, bodySecret: string | null): boolean {
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) return false;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return bodySecret != null && bodySecret === expected;
}

function wantsDryRun(req: NextRequest, body: Body): boolean {
  if (req.nextUrl.searchParams.get('dry_run') === 'true') return true;
  return body.dry_run === true || body.dry_run === 'true';
}

/**
 * Resolve the latest recording in each step folder. Returns the three paths
 * or, on the first failure, a NextResponse describing which part broke. No
 * audio is downloaded here — just directory listings.
 */
async function resolveLatestPaths(): Promise<Found | NextResponse> {
  const found: Found = { part1: '', part2: '', part3: '' };
  for (let i = 0; i < PART_DIRS.length; i++) {
    const dir = PART_DIRS[i];
    const key = `part${i + 1}` as keyof Found;
    const result = await latestWav(dir);
    if (!result.ok) {
      console.warn(`${TAG} ${key} (${dir}) lookup failed: ${result.error}`);
      return NextResponse.json(
        { ok: false, error: `missing ${key} (${dir}): ${result.error}` },
        { status: 502 },
      );
    }
    found[key] = result.path;
    console.log(`${TAG} latest ${key} ${result.path}`);
  }
  return found;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Empty body is fine — secret/dry_run may live in the query string.
  }

  if (!process.env.YEMOT_WEBHOOK_SECRET) {
    console.error(`${TAG} YEMOT_WEBHOOK_SECRET not configured in env`);
    return NextResponse.json({ ok: false, error: 'YEMOT_WEBHOOK_SECRET לא מוגדר בסביבה.' }, { status: 500 });
  }
  if (!hasValidSecret(req, body.secret ?? null)) {
    console.warn(`${TAG} invalid secret`);
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = wantsDryRun(req, body);

  // ── Find the three latest recordings (no audio downloaded yet) ──
  const resolved = await resolveLatestPaths();
  if (resolved instanceof NextResponse) return resolved;
  const found = resolved;

  // ── Dry-run: just report the paths, unchanged from before ──────
  if (dryRun) {
    console.log(`${TAG} dry-run found: ${found.part1} | ${found.part2} | ${found.part3}`);
    return NextResponse.json({ ok: true, dry_run: true, found });
  }

  // ── Real processing via the shared pipeline ────────────────────
  console.log(`${TAG} start process`);
  console.log(`${TAG} calling processThreeParts`);
  const result = await processThreeParts({
    part1Path: found.part1,
    part2Path: found.part2,
    part3Path: found.part3,
  });

  if (!result.ok) {
    console.error(`${TAG} processing failed: ${result.error}`);
    return NextResponse.json({ ok: false, processed: false, found, error: result.error }, { status: result.httpStatus });
  }

  console.log(`${TAG} draft created ${result.draft_id}`);
  console.log(`${TAG} done`);
  return NextResponse.json({
    ok:           true,
    processed:    true,
    found,
    draft_id:     result.draft_id,
    status:       result.status,
    match_status: result.match_status,
    parts:        result.parts,
    call_date:    result.call_date,
    redirect:     '/summaries/phone-pending',
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
