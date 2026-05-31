/**
 * GET | POST /api/phone/yemot-process-latest
 *
 *   Public webhook for Yemot's "/2/9 confirm" step. Its job (eventually)
 *   is to take the LATEST recording from each of the three step folders and
 *   run the shared 3-part pipeline.
 *
 *   THIS STEP IS DRY-RUN ONLY. It locates the newest .wav in each of:
 *     ivr2:/2/1   ivr2:/2/2   ivr2:/2/3
 *   and returns the three resolved paths. It does NOT transcribe, does NOT
 *   create a draft, does NOT download audio, and does NOT touch Yemot files.
 *   Wiring the actual processing is the next step.
 *
 * Security:
 *   YEMOT_WEBHOOK_SECRET via `?secret=` query OR a `secret` body field.
 *   Missing / wrong secret → 401.
 *
 * Request:
 *   dry_run=true  (query or body) — required in this step. Anything else is
 *   rejected with 400 so processing can never be triggered accidentally yet.
 *
 * Response (success):
 *   { ok: true, dry_run: true, found: { part1, part2, part3 } }
 * Response (failure):
 *   { ok: false, error }   (which folder failed is named in the message)
 *
 * Logging tag: [yemot-latest]
 */

import { NextRequest, NextResponse } from 'next/server';
import { latestWav } from '@/lib/yemot';

export const maxDuration = 30;

const TAG = '[yemot-latest]';

/** The three step folders, in part order. */
const PART_DIRS = ['ivr2:/2/1', 'ivr2:/2/2', 'ivr2:/2/3'] as const;

interface Body {
  secret?: string;
  dry_run?: boolean | string;
}

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

  // This step only supports dry-run — guardrail against early processing.
  if (!wantsDryRun(req, body)) {
    return NextResponse.json(
      { ok: false, error: 'only dry_run=true is supported in this step' },
      { status: 400 },
    );
  }

  const found: Record<'part1' | 'part2' | 'part3', string> = { part1: '', part2: '', part3: '' };
  for (let i = 0; i < PART_DIRS.length; i++) {
    const dir = PART_DIRS[i];
    const result = await latestWav(dir);
    if (!result.ok) {
      console.warn(`${TAG} part${i + 1} (${dir}) lookup failed: ${result.error}`);
      return NextResponse.json(
        { ok: false, error: `part${i + 1} (${dir}): ${result.error}` },
        { status: 502 },
      );
    }
    found[`part${i + 1}` as 'part1' | 'part2' | 'part3'] = result.path;
  }

  console.log(`${TAG} dry-run found: ${found.part1} | ${found.part2} | ${found.part3}`);
  return NextResponse.json({ ok: true, dry_run: true, found });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
