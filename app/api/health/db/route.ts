/**
 * GET /api/health/db — Supabase keepalive / health probe.
 *
 * Why this exists:
 *   Supabase's free tier PAUSES a project after ~7 days with no activity.
 *   A paused project stops answering queries until someone manually resumes
 *   it from the dashboard — which would take the whole app down. This
 *   endpoint performs ONE trivial, real database round-trip so an external
 *   scheduler can ping it every day or two and keep the project awake. As a
 *   bonus it also warms the Vercel deployment.
 *
 *   The scheduler is a GitHub Actions cron — see
 *   .github/workflows/supabase-keepalive.yml. GitHub's scheduler is free,
 *   runs independently of the Vercel plan's cron limits, and needs no
 *   secrets because this endpoint is public and read-only.
 *
 * Safety:
 *   Public + read-only ON PURPOSE. It returns only { ok, ts, ms } and never
 *   any row data, so exposing it leaks nothing and the cron can call it with
 *   a plain curl. The query is a HEAD count (no rows are transferred), so the
 *   load is negligible and it cannot be abused for anything meaningful.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';

// Never cache: every ping MUST actually reach Postgres, otherwise it would
// serve a stale cached response and never touch the database.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = createServerClient();

    // Cheapest possible real DB touch: a HEAD count on a table that always
    // exists. No rows are returned — this only proves Postgres answered.
    const { error } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true });

    const ms = Date.now() - startedAt;

    if (error) {
      // PostgREST answered (so the project is awake), but the query itself
      // failed. Report it for observability — still HTTP 200 so the pinger
      // treats "Supabase is reachable" as success.
      return NextResponse.json(
        {
          ok: false,
          reachedDb: true,
          ms,
          ts: new Date().toISOString(),
          error: error.message,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: true, reachedDb: true, ms, ts: new Date().toISOString() },
      { status: 200 },
    );
  } catch (err) {
    // Could not reach Supabase at all (network/timeout/misconfig) — the
    // project may be paused or env vars missing. Surface a 503 so the cron
    // run goes red and the failure is visible in the Actions log.
    const ms = Date.now() - startedAt;
    return NextResponse.json(
      {
        ok: false,
        reachedDb: false,
        ms,
        ts: new Date().toISOString(),
        error: (err as Error)?.message ?? String(err),
      },
      { status: 503 },
    );
  }
}
