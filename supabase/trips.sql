-- ── Trips — "נסיעות" ────────────────────────────────────────────────────────
--
-- Patient travel expenses: which patient, when, how (taxi / car / public
-- transport), how much, and free-text notes. The list is filtered by date and
-- patient, totalled, and exported to Excel / RTL PDF for the employer.
--
-- Self-contained — no other table depends on it. Read/written directly from
-- the browser via the authenticated Supabase client (same as the expenses and
-- petty-cash pages), so RLS grants full access to any authenticated user and
-- denies anon (service_role bypasses RLS). Mirrors rls-policies.sql.
--
-- Run this block once in the Supabase SQL Editor. Idempotent — safe to re-run.

create table if not exists trips (
  id         uuid primary key default gen_random_uuid(),
  -- Required in the UI. set null (not cascade delete) so removing a patient
  -- never silently drops the trip record — it just loses the link.
  patient_id uuid references patients(id) on delete set null,
  date       date not null,
  -- taxi / car / public — display labels live in the UI (lib/trips.ts).
  trip_type  text not null check (trip_type in ('taxi','car','public')),
  amount     numeric(10,2) not null default 0,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list is ordered by date (newest first) and filtered by patient.
create index if not exists idx_trips_date    on trips (date desc);
create index if not exists idx_trips_patient on trips (patient_id, date desc);

-- Auto-bump updated_at (reuses the shared trigger function from schema.sql).
drop trigger if exists trg_trips_updated_at on trips;
create trigger trg_trips_updated_at
  before update on trips
  for each row execute function update_updated_at();

-- RLS: full access to an authenticated session only (anon denied; service_role
-- bypasses). Same shape as the data-table policies in rls-policies.sql.
alter table trips enable row level security;
drop policy if exists trips_authenticated_all on trips;
create policy trips_authenticated_all on trips
  for all to authenticated using (true) with check (true);
