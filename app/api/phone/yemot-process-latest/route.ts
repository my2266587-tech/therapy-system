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

import { NextRequest, NextResponse, after } from 'next/server';
import { latestWav } from '@/lib/yemot';
import { processThreeParts } from '@/lib/yemot3part';

export const maxDuration = 120;

const TAG = '[yemot-process-latest]';

/** The three step folders, in part order. */
const PART_DIRS = ['ivr2:/2/1', 'ivr2:/2/2', 'ivr2:/2/3'] as const;

/**
 * Best-effort idempotency for the Yemot fast path, keyed by the three
 * resolved paths. Yemot may re-call (network blip / double keypress); if the
 * same recording set is already being processed or was just processed, we
 * skip a duplicate draft. This is IN-MEMORY (module scope) so it only spans
 * one warm serverless instance — enough for retries seconds apart. A robust
 * cross-instance guard would need to persist the path-key, which is a schema
 * change we have NOT made.
 */
const inFlightKeys = new Set<string>();
const processedKeys = new Set<string>();

interface Body {
  secret?: string;
  dry_run?: boolean | string;
  response_mode?: string;
}

type Found = Record<'part1' | 'part2' | 'part3', string>;

function hasValidSecret(req: NextRequest, bodySecret: string | null): boolean {
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) return false;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return bodySecret != null && bodySecret === expected;
}

/**
 * Yemot Mashiach's API extension can't parse JSON — it wants a plain
 * `id_list_message=t-<text>` line. Callers opt in with `response_mode=yemot`
 * (query or body). When absent we keep returning JSON exactly as before, so
 * the manual curl/browser tests are untouched. Mirrors /api/phone/yemot-summary.
 */
function wantsYemotResponse(req: NextRequest, body: Body): boolean {
  if (req.nextUrl.searchParams.get('response_mode') === 'yemot') return true;
  return body.response_mode === 'yemot';
}

/** Build a Yemot-flavoured text/plain reply: `id_list_message=t-<message>`. */
function yemotReply(message: string, status: number): NextResponse {
  return new NextResponse(`id_list_message=t-${message}`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
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

  // Decide the reply format up front so every exit can honour it.
  const yemot = wantsYemotResponse(req, body);

  if (!process.env.YEMOT_WEBHOOK_SECRET) {
    console.error(`${TAG} YEMOT_WEBHOOK_SECRET not configured in env`);
    return NextResponse.json({ ok: false, error: 'YEMOT_WEBHOOK_SECRET לא מוגדר בסביבה.' }, { status: 500 });
  }
  if (!hasValidSecret(req, body.secret ?? null)) {
    console.warn(`${TAG} invalid secret`);
    if (yemot) return yemotReply('שגיאת הרשאה. נא לפנות למנהלת המערכת.', 401);
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = wantsDryRun(req, body);

  // ════════════════════════════════════════════════════════════════
  // Yemot fast path: validate quickly, answer the caller immediately,
  // and do the heavy work in `after` so the line isn't left silent.
  // (Only when response_mode=yemot AND not a dry-run.)
  // ════════════════════════════════════════════════════════════════
  if (yemot && !dryRun) {
    console.log(`${TAG} yemot fast response start`);
    const resolved = await resolveLatestPaths();
    if (resolved instanceof NextResponse) {
      return yemotReply('חסר חלק מההקלטה. נא לנסות שוב.', 502);
    }
    const found = resolved;
    console.log(`${TAG} found paths ${found.part1} | ${found.part2} | ${found.part3}`);

    const key = `${found.part1}|${found.part2}|${found.part3}`;
    if (processedKeys.has(key) || inFlightKeys.has(key)) {
      console.log(`${TAG} duplicate request for ${key} — skipping`);
      return yemotReply('הסיכום כבר נקלט ונמצא בעיבוד.', 200);
    }
    inFlightKeys.add(key);

    // Schedule the heavy pipeline after the response is flushed. On Vercel
    // `after` is backed by waitUntil, so the function stays alive until this
    // settles — not a fire-and-forget that the platform might cut off.
    after(async () => {
      console.log(`${TAG} background process started`);
      try {
        const result = await processThreeParts({
          part1Path: found.part1,
          part2Path: found.part2,
          part3Path: found.part3,
        });
        if (result.ok) {
          processedKeys.add(key);
          console.log(`${TAG} background draft created ${result.draft_id}`);
        } else {
          console.error(`${TAG} background failed: ${result.error}`);
        }
      } catch (e) {
        console.error(`${TAG} background failed: ${(e as Error).message}`);
      } finally {
        inFlightKeys.delete(key);
      }
    });

    console.log(`${TAG} returning immediate yemot response`);
    return yemotReply('הסיכום נקלט ונשלח לעיבוד. ניתן לנתק.', 200);
  }

  // ── Find the three latest recordings (no audio downloaded yet) ──
  const resolved = await resolveLatestPaths();
  if (resolved instanceof NextResponse) {
    // A folder was missing a recording. The JSON detail is in `resolved`;
    // for Yemot we play a generic try-again message instead.
    if (yemot) return yemotReply('אירעה שגיאה בשליחת הסיכום. נא לנסות שוב או לפנות למנהלת המערכת.', 502);
    return resolved;
  }
  const found = resolved;

  // ── Dry-run: just report the paths, unchanged from before ──────
  if (dryRun) {
    console.log(`${TAG} dry-run found: ${found.part1} | ${found.part2} | ${found.part3}`);
    return NextResponse.json({ ok: true, dry_run: true, found });
  }

  // ── Real processing via the shared pipeline (manual JSON path) ─
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
