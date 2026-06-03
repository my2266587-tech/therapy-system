-- ============================================================================
-- Row Level Security (RLS) — Supabase Security Advisor remediation
-- ============================================================================
-- Run this in the Supabase SQL Editor to clear the two critical warnings:
--   • rls_disabled_in_public  — every public table now has RLS enabled.
--   • exposed_sensitive_data  — the public `anon` role can no longer read any
--                               PII / clinical / financial data via PostgREST.
--
-- This block is also appended (identically) to schema.sql so fresh installs are
-- secure by default. It is idempotent and tolerant of missing tables — safe to
-- re-run, and safe even if production is missing some tables from schema.sql.
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
--
-- ── Expected tables ─────────────────────────────────────────────────────────
-- Data tables (RLS + `authenticated`-only policy):
--   staff, patients, sessions, session_summaries, recordings,
--   quarterly_summaries, payments, private_expenses, petty_cash,
--   staff_patients, staff_documents, patient_documents,
--   report_runs, phone_summary_drafts
-- Access-control list (RLS, NO policy → service_role only):
--   authorized_users
--
-- Any table in these lists that does NOT exist in the live DB is skipped with a
-- NOTICE (see the "Messages" tab of the SQL Editor output). Nothing is created,
-- dropped, or altered beyond enabling RLS and (re)creating the named policy.
-- ============================================================================

-- ── Application data tables ─────────────────────────────────────────────────
-- For each table THAT EXISTS: enable RLS and grant full access to an
-- authenticated session only. (anon denied; service_role bypasses RLS.)
-- Missing tables are skipped safely. to_regclass() returns NULL for a missing
-- relation instead of raising, which is what lets us skip cleanly.
do $$
declare
  t       text;
  handled text[] := '{}';
  skipped text[] := '{}';
begin
  foreach t in array array[
    'staff','patients','sessions','session_summaries','recordings',
    'quarterly_summaries','payments','private_expenses','petty_cash',
    'staff_patients','staff_documents','patient_documents',
    'report_runs','phone_summary_drafts'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is null then
      skipped := skipped || t;
      raise notice 'SKIP  (missing)                     : public.%', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );

    handled := handled || t;
    raise notice 'OK    (RLS + authenticated policy)  : public.%', t;
  end loop;

  raise notice '----------------------------------------------------------------';
  raise notice 'Data tables handled (%): %',
    coalesce(array_length(handled, 1), 0), array_to_string(handled, ', ');
  raise notice 'Data tables skipped (%): %',
    coalesce(array_length(skipped, 1), 0), array_to_string(skipped, ', ');
end $$;

-- ── authorized_users (access-control list) ──────────────────────────────────
-- Holds the admin/staff email allow-list. The app only ever reads it
-- server-side via the service role (lib/getAdminUser.ts), so we enable RLS and
-- add NO policy: anon AND authenticated are both denied, while the service role
-- still bypasses RLS. The admin email list is therefore never exposed via
-- PostgREST. Skipped safely if the table is missing.
do $$
begin
  if to_regclass('public.authorized_users') is null then
    raise notice 'SKIP  (missing)                     : public.authorized_users';
  else
    alter table public.authorized_users enable row level security;
    raise notice 'OK    (RLS, service_role only)      : public.authorized_users';
  end if;
end $$;
