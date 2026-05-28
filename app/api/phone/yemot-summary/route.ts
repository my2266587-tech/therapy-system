/**
 * POST /api/phone/yemot-summary
 *
 *   Public webhook intended for Yemot Mashiach to POST a finished phone
 *   summary (later — currently nobody is wired to call it yet). Accepts
 *   the same content fields as the internal /api/admin/phone-drafts
 *   route, runs the same patient lookup, and creates a row in
 *   phone_summary_drafts. The clinician then reviews + approves it on
 *   /summaries/phone-pending.
 *
 *   This route is INTENTIONALLY separate from the admin route so the
 *   Yemot pipeline never accidentally gets a Bearer user token, and the
 *   in-app pages never expose this webhook secret on the client.
 *
 * Security:
 *   YEMOT_WEBHOOK_SECRET env var is required. The caller must present
 *   the same value either as:
 *     - HTTP header `x-yemot-secret: <value>`
 *     - OR query string `?secret=<value>`
 *   Missing / wrong secret → 401, no draft created, nothing logged at
 *   ERROR level (just a WARN so we don't drown the logs if someone
 *   probes the URL).
 *
 * Body (all fields optional, text/JSON):
 *   spoken_patient_name, current_state, main_topics, treatment_actions,
 *   next_steps, tasks_given, progress, difficulties, notes,
 *   call_date (YYYY-MM-DD), call_start_time (HH:MM), call_end_time,
 *   caller_phone (optional — accepted but NOT persisted; the table
 *   currently has no column for it. Adding one is gated behind a
 *   migration we haven't run yet).
 *
 * Response:
 *   { ok: true, draft_id, status, match_status }
 *
 * Logging tag: [yemot-webhook] — grep this in Vercel function logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

export const maxDuration = 30;

const TAG = '[yemot-webhook]';

/** Returns the secret the caller presented, in either supported form. */
function getProvidedSecret(req: NextRequest): string | null {
  const headerSecret = req.headers.get('x-yemot-secret');
  if (headerSecret) return headerSecret;
  return req.nextUrl.searchParams.get('secret');
}

interface YemotBody {
  spoken_patient_name?: string;
  current_state?:       string;
  main_topics?:         string;
  treatment_actions?:   string;
  next_steps?:          string;
  tasks_given?:         string;
  progress?:            string;
  difficulties?:        string;
  notes?:               string;
  call_date?:           string;
  call_start_time?:     string;
  call_end_time?:       string;
  /** Accepted from Yemot but NOT persisted yet — see file header. */
  caller_phone?:        string;
}

export async function POST(req: NextRequest) {
  console.log(`${TAG} received`);

  // ── 1. Secret check ────────────────────────────────────────────
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) {
    // Bare 500 here so an unconfigured deploy is obvious in the logs.
    console.error(`${TAG} YEMOT_WEBHOOK_SECRET not configured in env`);
    return NextResponse.json(
      { error: 'YEMOT_WEBHOOK_SECRET לא מוגדר בסביבה.' },
      { status: 500 },
    );
  }
  const provided = getProvidedSecret(req);
  if (!provided || provided !== expected) {
    console.warn(`${TAG} invalid secret (provided=${provided ? 'present' : 'missing'})`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Body ────────────────────────────────────────────────────
  let body: YemotBody;
  try {
    body = (await req.json()) as YemotBody;
  } catch {
    console.warn(`${TAG} invalid JSON body`);
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 });
  }

  // caller_phone is accepted by the contract but we can't store it
  // without a migration — log it so the future Yemot integration team
  // can debug missing data once the column lands.
  if (body.caller_phone) {
    console.log(`${TAG} caller_phone received (not persisted; no column yet): ${body.caller_phone}`);
  }

  const name = (body.spoken_patient_name ?? '').trim();
  const supabase = createServerClient();

  // ── 3. Patient match (ILIKE same as the admin route) ──────────
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

  // ── 4. Insert draft ───────────────────────────────────────────
  const insertRow = {
    spoken_patient_name: name || null,
    matched_patient_id,
    match_status,
    status,
    current_state:     body.current_state     ?? null,
    main_topics:       body.main_topics       ?? null,
    treatment_actions: body.treatment_actions ?? null,
    next_steps:        body.next_steps        ?? null,
    tasks_given:       body.tasks_given       ?? null,
    progress:          body.progress          ?? null,
    difficulties:      body.difficulties      ?? null,
    notes:             body.notes             ?? null,
    call_date:         body.call_date         ?? null,
    call_start_time:   body.call_start_time   ?? null,
    call_end_time:     body.call_end_time     ?? null,
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

  console.log(`${TAG} draft created: id=${data.id} status=${status} match=${match_status}`);

  return NextResponse.json({
    ok:           true,
    draft_id:     data.id,
    status,
    match_status,
  });
}
