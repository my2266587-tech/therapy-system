/**
 * /api/admin/phone-drafts
 *
 *   The CRM-side endpoints for the phone-summary draft flow. This file
 *   wires the LIST and CREATE operations:
 *
 *     GET  /api/admin/phone-drafts?status=...   list drafts (newest first)
 *     POST /api/admin/phone-drafts              insert a fresh draft
 *
 *   The future Yemot Mashiach webhook will POST here too. For now, only
 *   the in-app dev/test button on /summaries/phone-pending uses POST.
 *
 * Auth:
 *   Accepts EITHER a Bearer CRON_SECRET (for system / webhook calls)
 *   OR a Bearer user token of an active authorized user (for UI calls).
 *   Whichever wins, proceeds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

export const maxDuration = 30;

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function authorize(req: NextRequest): Promise<{ ok: true; userEmail: string | null } | { ok: false; status: number; error: string }> {
  if (isCron(req)) return { ok: true, userEmail: null };
  const user = await getAuthorizedUser(req);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true, userEmail: user.email };
}

const ALLOWED_STATUSES = ['draft_ready', 'needs_match', 'failed', 'approved'] as const;
type Status = typeof ALLOWED_STATUSES[number];
const ALLOWED_MATCH = ['matched', 'ambiguous', 'not_found'] as const;
type MatchStatus = typeof ALLOWED_MATCH[number];

/* ── GET ──────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const sp = req.nextUrl.searchParams;
    const status = sp.get('status');
    const limitRaw = Number(sp.get('limit') ?? '50');
    const limit = Number.isFinite(limitRaw)
      ? Math.min(200, Math.max(1, Math.floor(limitRaw)))
      : 50;

    const supabase = createServerClient();
    let q = supabase
      .from('phone_summary_drafts')
      .select('*, matched_patient:matched_patient_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status && (ALLOWED_STATUSES as readonly string[]).includes(status)) {
      q = q.eq('status', status);
    }
    const { data, error } = await q;
    if (error) throw new Error(`phone-drafts fetch: ${error.message}`);
    return NextResponse.json({ drafts: data ?? [] });
  } catch (err) {
    console.error('[phone-drafts GET]', { message: (err as Error)?.message });
    return NextResponse.json(
      { error: (err as Error)?.message ?? String(err) },
      { status: 500 },
    );
  }
}

/* ── POST — create a draft ────────────────────────────────────────── */

interface CreateBody {
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
  source_transcript?:   string;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let body: CreateBody;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Patient match using the same ILIKE rule the assistant uses. We
    // don't import findPatient to keep the route self-contained.
    const name = (body.spoken_patient_name ?? '').trim();
    let matched_patient_id: string | null = null;
    let match_status: MatchStatus = 'not_found';
    let status: Status = 'needs_match';

    if (name) {
      const { data: candidates, error: lookupErr } = await supabase
        .from('patients')
        .select('id, full_name')
        .ilike('full_name', `%${name}%`)
        .limit(5);
      if (lookupErr) throw new Error(`patient lookup: ${lookupErr.message}`);
      const list = candidates ?? [];
      if (list.length === 1) {
        matched_patient_id = list[0].id;
        match_status = 'matched';
        status = 'draft_ready';
      } else if (list.length > 1) {
        match_status = 'ambiguous';
        status = 'needs_match';
      } else {
        match_status = 'not_found';
        status = 'needs_match';
      }
    } else {
      match_status = 'not_found';
      status = 'needs_match';
    }

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
      source_transcript: body.source_transcript ?? null,
    };

    const { data, error: insErr } = await supabase
      .from('phone_summary_drafts')
      .insert(insertRow)
      .select('*, matched_patient:matched_patient_id(full_name)')
      .single();
    if (insErr) throw new Error(`insert: ${insErr.message}`);

    return NextResponse.json({ draft: data }, { status: 201 });
  } catch (err) {
    console.error('[phone-drafts POST]', { message: (err as Error)?.message });
    return NextResponse.json(
      { error: (err as Error)?.message ?? String(err) },
      { status: 500 },
    );
  }
}
