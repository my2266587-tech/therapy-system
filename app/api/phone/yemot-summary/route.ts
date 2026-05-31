/**
 * GET  /api/phone/yemot-summary
 * POST /api/phone/yemot-summary
 *
 *   Public webhook intended for Yemot Mashiach to deliver a finished
 *   phone summary. Accepts the same content fields as the internal
 *   /api/admin/phone-drafts route, runs the same patient lookup, and
 *   creates a row in phone_summary_drafts. The clinician then reviews +
 *   approves it on /summaries/phone-pending.
 *
 *   This route is INTENTIONALLY separate from the admin route so the
 *   Yemot pipeline never accidentally gets a Bearer user token, and the
 *   in-app pages never expose this webhook secret on the client.
 *
 * Accepted request shapes (Yemot's API module can use any of them):
 *   - GET  with query params               (?spoken_patient_name=...&secret=...)
 *   - POST application/json                 (original shape)
 *   - POST application/x-www-form-urlencoded
 *   All three map onto the exact same fields and the same draft flow.
 *
 * Security:
 *   YEMOT_WEBHOOK_SECRET env var is required. The caller must present
 *   the same value in ANY one of:
 *     - HTTP header `x-yemot-secret: <value>`
 *     - query string `?secret=<value>`
 *     - a `secret` field inside the JSON / form body
 *   Missing / wrong secret → 401, no draft created, nothing logged at
 *   ERROR level (just a WARN so we don't drown the logs if someone
 *   probes the URL).
 *
 * Fields (all optional):
 *   spoken_patient_name, current_state, main_topics, treatment_actions,
 *   next_steps, tasks_given, progress, difficulties, notes,
 *   call_date (YYYY-MM-DD), call_start_time (HH:MM), call_end_time,
 *   caller_phone (optional — accepted but NOT persisted; the table
 *   currently has no column for it. Adding one is gated behind a
 *   migration we haven't run yet).
 *
 * Response:
 *   Default: JSON { ok: true, draft_id, status, match_status }.
 *   With `?response_mode=yemot`: text/plain `id_list_message=t-<message>`
 *   that Yemot Mashiach's API extension can read aloud — success and the
 *   401 auth error both use this shape. All other behaviour is unchanged.
 *
 * Logging tag: [yemot-webhook] — grep this in Vercel function logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

export const maxDuration = 30;

const TAG = '[yemot-webhook]';

/** The content fields we read out of the request, in any format. */
const FIELD_KEYS = [
  'spoken_patient_name',
  'current_state',
  'main_topics',
  'treatment_actions',
  'next_steps',
  'tasks_given',
  'progress',
  'difficulties',
  'notes',
  'call_date',
  'call_start_time',
  'call_end_time',
  'caller_phone',
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];
type Fields = Partial<Record<FieldKey, string>>;

/** Where the request data came from — surfaced in logs. */
type ParsedKind = 'query' | 'json' | 'form';

interface ParsedInput {
  kind: ParsedKind;
  fields: Fields;
  /** A `secret` carried inside the body/query, if any (header is read separately). */
  bodySecret: string | null;
}

/** Pull our known field keys (+ secret) out of any key/value source. */
function collectFields(get: (key: string) => string | null): {
  fields: Fields;
  bodySecret: string | null;
} {
  const fields: Fields = {};
  for (const key of FIELD_KEYS) {
    const value = get(key);
    if (value != null && value !== '') fields[key] = value;
  }
  return { fields, bodySecret: get('secret') };
}

/**
 * Reads the request into a uniform { fields } shape regardless of how
 * Yemot sent it: GET query, POST JSON, or POST form-urlencoded.
 */
async function parseRequest(req: NextRequest): Promise<ParsedInput> {
  // GET → everything lives in the query string.
  if (req.method === 'GET') {
    const sp = req.nextUrl.searchParams;
    const { fields, bodySecret } = collectFields((k) => sp.get(k));
    return { kind: 'query', fields, bodySecret };
  }

  // POST → branch on content-type.
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    const { fields, bodySecret } = collectFields((k) => params.get(k));
    return { kind: 'form', fields, bodySecret };
  }

  // Default / explicit JSON.
  const body = (await req.json()) as Record<string, unknown>;
  const get = (k: string): string | null => {
    const v = body[k];
    return typeof v === 'string' ? v : v != null ? String(v) : null;
  };
  const { fields, bodySecret } = collectFields(get);
  return { kind: 'json', fields, bodySecret };
}

/**
 * Yemot Mashiach's API extension can't parse JSON — it wants a plain
 * `id_list_message=t-<text>` line. Callers opt in with `?response_mode=yemot`.
 * When that flag is absent we keep returning JSON exactly as before, so the
 * existing curl/JSON/GET tests are untouched.
 */
function wantsYemotResponse(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get('response_mode') === 'yemot';
}

/** Build a Yemot-flavoured text/plain reply: `id_list_message=t-<message>`. */
function yemotReply(message: string, status: number): NextResponse {
  return new NextResponse(`id_list_message=t-${message}`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Resolve the presented secret from header → query → body, in that order. */
function resolveSecret(req: NextRequest, bodySecret: string | null): string | null {
  const headerSecret = req.headers.get('x-yemot-secret');
  if (headerSecret) return headerSecret;
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (querySecret) return querySecret;
  return bodySecret;
}

/** Shared handler for GET and POST — only the parsing differs. */
async function handle(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get('content-type') ?? '(none)';
  console.log(`${TAG} received: method=${req.method} content-type=${contentType}`);

  // ── 1. Secret env present? ─────────────────────────────────────
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) {
    console.error(`${TAG} YEMOT_WEBHOOK_SECRET not configured in env`);
    return NextResponse.json(
      { error: 'YEMOT_WEBHOOK_SECRET לא מוגדר בסביבה.' },
      { status: 500 },
    );
  }

  // ── 2. Parse the request in whatever shape Yemot sent ──────────
  let parsed: ParsedInput;
  try {
    parsed = await parseRequest(req);
  } catch {
    console.warn(`${TAG} could not parse body (method=${req.method}, content-type=${contentType})`);
    return NextResponse.json({ error: 'גוף הבקשה לא תקין' }, { status: 400 });
  }
  console.log(`${TAG} parsed as: ${parsed.kind}`);

  // ── 3. Secret check (header → query → body) ────────────────────
  const provided = resolveSecret(req, parsed.bodySecret);
  if (!provided || provided !== expected) {
    console.warn(`${TAG} invalid secret (provided=${provided ? 'present' : 'missing'})`);
    if (wantsYemotResponse(req)) {
      return yemotReply('שגיאת הרשאה.', 401);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fields } = parsed;

  // caller_phone is accepted by the contract but we can't store it
  // without a migration — log it so the future Yemot integration team
  // can debug missing data once the column lands.
  if (fields.caller_phone) {
    console.log(`${TAG} caller_phone received (not persisted; no column yet): ${fields.caller_phone}`);
  }

  const name = (fields.spoken_patient_name ?? '').trim();
  const supabase = createServerClient();

  // ── 4. Patient match (ILIKE same as the admin route) ───────────
  let matched_patient_id: string | null = null;
  let match_status: 'matched' | 'ambiguous' | 'not_found' = 'not_found';
  let status: 'draft_ready' | 'needs_match' = 'needs_match';

  if (name) {
    const { data: candidates, error: lookupErr } = await supabase
      .from('patients')
      .select('id, full_name')
      .ilike('full_name', `%${name}%`)
      .limit(5);
    if (lookupErr) {
      console.error(`${TAG} patient lookup failed:`, lookupErr.message);
      return NextResponse.json({ error: `patient lookup: ${lookupErr.message}` }, { status: 500 });
    }
    const list = candidates ?? [];
    if (list.length === 1) {
      matched_patient_id = list[0].id;
      match_status = 'matched';
      status = 'draft_ready';
      console.log(`${TAG} patient matched: id=${list[0].id} name="${list[0].full_name}"`);
    } else if (list.length > 1) {
      match_status = 'ambiguous';
      status = 'needs_match';
      console.log(`${TAG} patient ambiguous: ${list.length} candidates for "${name}"`);
    } else {
      match_status = 'not_found';
      status = 'needs_match';
      console.log(`${TAG} patient not found for "${name}"`);
    }
  } else {
    console.log(`${TAG} no spoken_patient_name provided → needs_match`);
  }

  // ── 5. Insert draft ────────────────────────────────────────────
  const insertRow = {
    spoken_patient_name: name || null,
    matched_patient_id,
    match_status,
    status,
    current_state:     fields.current_state     ?? null,
    main_topics:       fields.main_topics       ?? null,
    treatment_actions: fields.treatment_actions ?? null,
    next_steps:        fields.next_steps        ?? null,
    tasks_given:       fields.tasks_given       ?? null,
    progress:          fields.progress          ?? null,
    difficulties:      fields.difficulties      ?? null,
    notes:             fields.notes             ?? null,
    call_date:         fields.call_date         ?? null,
    call_start_time:   fields.call_start_time   ?? null,
    call_end_time:     fields.call_end_time     ?? null,
  };

  const { data, error: insErr } = await supabase
    .from('phone_summary_drafts')
    .insert(insertRow)
    .select('id')
    .single();
  if (insErr) {
    console.error(`${TAG} draft creation failed:`, insErr.message);
    return NextResponse.json({ error: `draft creation failed: ${insErr.message}` }, { status: 500 });
  }

  console.log(`${TAG} draft created: id=${data.id} status=${status} match=${match_status} (via ${parsed.kind})`);

  if (wantsYemotResponse(req)) {
    return yemotReply('הסיכום נקלט בהצלחה.', 200);
  }

  return NextResponse.json({
    ok:           true,
    draft_id:     data.id,
    status,
    match_status,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
