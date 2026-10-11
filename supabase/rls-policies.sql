-- ============================================================================
-- Row Level Security (RLS) — access limited to authorized_users
-- ============================================================================
-- Run this whole file in the Supabase SQL Editor. Idempotent — safe to re-run,
-- and tolerant of missing tables (skipped with a NOTICE).
--
-- This block is also appended (identically) to the end of schema.sql so fresh
-- installs are secure by default.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Being signed in to Supabase (any Google account → Postgres role
-- `authenticated`) is NOT the same as being allowed into the system. The
-- earlier policies were `to authenticated using (true)`, so any Google account
-- that managed to sign in could read every clinical record straight through
-- PostgREST with the public anon key, bypassing the UI and the API checks.
--
-- ── Auth model ──────────────────────────────────────────────────────────────
--   • public.is_authorized_user() — the JWT email is listed in authorized_users
--     with is_active = true (admin or staff).
--   • public.is_admin_user()      — same, and role = 'admin'.
--   • Browser queries run as `authenticated` with the user's JWT → every policy
--     below requires is_authorized_user() (admin-only tables: is_admin_user()).
--   • All server code (API routes, phone webhooks, cron, imports, the AI
--     assistant) uses the SERVICE ROLE key, which BYPASSES RLS — unaffected.
--   • `anon` gets nothing. authorized_users itself has RLS with NO policy
--     (service role only), and intake_forms likewise.
--
-- Policies are wrapped as `(select public.is_authorized_user())` so Postgres
-- evaluates the check once per query, not once per row.
-- ============================================================================

-- ── Access-check functions ──────────────────────────────────────────────────
-- SECURITY DEFINER so they can read authorized_users (which has no policy for
-- `authenticated`). Empty search_path + fully-qualified names = no hijacking.
create or replace function public.is_authorized_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.authorized_users au
    where lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and au.is_active
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.authorized_users au
    where lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and au.is_active
      and au.role = 'admin'
  );
$$;

revoke all on function public.is_authorized_user() from public, anon;
revoke all on function public.is_admin_user()      from public, anon;
grant execute on function public.is_authorized_user() to authenticated;
grant execute on function public.is_admin_user()      to authenticated;

-- ── Application data tables ─────────────────────────────────────────────────
-- For each table THAT EXISTS: enable RLS, drop the old permissive policy, and
-- allow full access to authorized users only (admin-only for the owner's
-- private finance tables). Missing tables are skipped.
do $$
declare
  t        text;
  is_admin boolean;
  check_fn text;
  handled  text[] := '{}';
  skipped  text[] := '{}';
begin
  foreach t in array array[
    -- authorized users (admin + staff)
    'staff','patients','sessions','session_summaries','recordings',
    'quarterly_summaries','payments','staff_patients','staff_documents',
    'patient_documents','report_runs','phone_summary_drafts',
    'tasks','trips','hour_banks','work_time_entries','hour_bank_transactions',
    -- admin only
    'private_expenses','petty_cash'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is null then
      skipped := skipped || t;
      raise notice 'SKIP  (missing)          : public.%', t;
      continue;
    end if;

    is_admin := t in ('private_expenses', 'petty_cash');
    check_fn := case when is_admin then 'public.is_admin_user()' else 'public.is_authorized_user()' end;

    execute format('alter table public.%I enable row level security;', t);
    -- Old permissive policy (to authenticated using (true)).
    execute format('drop policy if exists %I on public.%I;', t || '_authenticated_all', t);
    execute format('drop policy if exists %I on public.%I;', t || '_authorized', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select %s)) with check ((select %s));',
      t || '_authorized', t, check_fn, check_fn
    );

    handled := handled || t;
    raise notice 'OK    (%) : public.%', case when is_admin then 'admin only ' else 'authorized ' end, t;
  end loop;

  raise notice '----------------------------------------------------------------';
  raise notice 'Data tables handled (%): %',
    coalesce(array_length(handled, 1), 0), array_to_string(handled, ', ');
  raise notice 'Data tables skipped (%): %',
    coalesce(array_length(skipped, 1), 0), array_to_string(skipped, ', ');
end $$;

-- ── app_settings: read-only for authorized users ────────────────────────────
-- Writes go through /api/settings (service role, admin-checked).
do $$
begin
  if to_regclass('public.app_settings') is null then
    raise notice 'SKIP  (missing)          : public.app_settings';
  else
    alter table public.app_settings enable row level security;
    drop policy if exists app_settings_read on public.app_settings;
    create policy app_settings_read on public.app_settings
      for select to authenticated using ((select public.is_authorized_user()));
    raise notice 'OK    (authorized read)  : public.app_settings';
  end if;
end $$;

-- ── Service-role-only tables (RLS on, NO policy) ────────────────────────────
-- authorized_users: the allow-list itself — never exposed via PostgREST.
-- intake_forms:     reached only through the token-checked /api/intake routes.
do $$
declare
  t text;
begin
  foreach t in array array['authorized_users', 'intake_forms'] loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice 'SKIP  (missing)          : public.%', t;
    else
      execute format('alter table public.%I enable row level security;', t);
      raise notice 'OK    (service role only): public.%', t;
    end if;
  end loop;
end $$;

-- ── Storage buckets (all private) ───────────────────────────────────────────
-- The app reaches storage only through API routes (service role), so these are
-- defense-in-depth. Policies are re-created under their ORIGINAL names: the
-- `if not exists` blocks earlier in schema.sql then see them and won't add the
-- old permissive versions back if schema.sql is re-run.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('recordings_authenticated_read',          'select', 'recordings'),
      ('recordings_authenticated_write',         'insert', 'recordings'),
      ('recordings_authenticated_delete',        'delete', 'recordings'),
      ('staff_documents_authenticated_read',     'select', 'staff-documents'),
      ('staff_documents_authenticated_write',    'insert', 'staff-documents'),
      ('staff_documents_authenticated_delete',   'delete', 'staff-documents'),
      ('patient_documents_authenticated_read',   'select', 'patient-documents'),
      ('patient_documents_authenticated_write',  'insert', 'patient-documents'),
      ('patient_documents_authenticated_delete', 'delete', 'patient-documents'),
      ('monthly_reports_authenticated_read',     'select', 'monthly-reports'),
      ('monthly_reports_authenticated_write',    'insert', 'monthly-reports')
    ) as v(name, cmd, bucket)
  loop
    execute format('drop policy if exists %I on storage.objects;', p.name);
    if p.cmd = 'insert' then
      execute format(
        'create policy %I on storage.objects for insert to authenticated
           with check (bucket_id = %L and (select public.is_authorized_user()));',
        p.name, p.bucket);
    else
      execute format(
        'create policy %I on storage.objects for %s to authenticated
           using (bucket_id = %L and (select public.is_authorized_user()));',
        p.name, p.cmd, p.bucket);
    end if;
  end loop;
  raise notice 'OK    storage.objects policies now require an authorized user';
end $$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Any row returned here is a policy still open to every signed-in account:
--   select schemaname, tablename, policyname, qual
--   from pg_policies
--   where schemaname in ('public', 'storage')
--     and (qual = 'true' or with_check = 'true');
