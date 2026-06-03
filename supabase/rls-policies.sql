-- ============================================================================
-- Row Level Security (RLS) — Supabase Security Advisor remediation
-- ============================================================================
-- Run this in the Supabase SQL Editor to clear the two critical warnings:
--   • rls_disabled_in_public  — every public table now has RLS enabled.
--   • exposed_sensitive_data  — the public `anon` role can no longer read any
--                               PII / clinical / financial data via PostgREST.
--
-- This block is also appended (identically) to schema.sql so fresh installs are
-- secure by default. It is idempotent — safe to re-run.
--
-- ── Auth model (unchanged by this file) ─────────────────────────────────────
--   • Browser client uses the anon key, but once a user signs in with Google
--     (Supabase Auth) every query carries that user's JWT and runs as the
--     Postgres `authenticated` role.
--   • All server code (API routes, the Yemot phone webhooks, cron, imports, the
--     AI assistant) uses the SERVICE ROLE key via lib/supabaseServer.ts. The
--     service role BYPASSES RLS, so none of these policies affect it.
--   • Unauthenticated (`anon`) callers get NO access to application data.
--
-- We do not FORCE RLS, so the service role keeps its bypass — existing server
-- flows are untouched. We never reference the service_role key here, and no
-- existing storage policies are modified.
-- ============================================================================

-- ── Application data tables ─────────────────────────────────────────────────
-- Enable RLS and grant full access to an authenticated session only.
-- (anon is denied; service_role bypasses RLS and is unaffected.)
do $$
declare t text;
begin
  foreach t in array array[
    'staff','patients','sessions','session_summaries','recordings',
    'quarterly_summaries','payments','private_expenses','petty_cash',
    'staff_patients','staff_documents','patient_documents',
    'report_runs','phone_summary_drafts'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- ── authorized_users (access-control list) ──────────────────────────────────
-- This table holds the admin/staff email allow-list. The app only ever reads
-- it server-side via the service role (lib/getAdminUser.ts), so we enable RLS
-- and add NO policy: anon AND authenticated are both denied, while the service
-- role still bypasses RLS. The admin email list is therefore never exposed
-- through PostgREST.
alter table public.authorized_users enable row level security;
