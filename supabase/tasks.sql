-- ── Task Board — "לוח משימות" ───────────────────────────────────────────────
--
-- A standalone to-do board for the team: create tasks with everything needed
-- (title, details, priority, due date, an optional responsible person and an
-- optional linked patient) and tick them off when done ("סמן הושלם").
--
-- Self-contained — no other table depends on it. The board is read/written
-- directly from the browser via the authenticated Supabase client (same as the
-- sessions/expenses pages), so RLS grants full access to any authenticated user
-- and denies anon (service_role bypasses RLS). Mirrors rls-policies.sql.
--
-- Run this block once in the Supabase SQL Editor. Idempotent — safe to re-run.

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  -- Free-text grouping label ("קטגוריה"). Tasks are shown as cards grouped by
  -- this. Null/empty tasks fall into a default "כללי" group in the UI.
  category     text,
  -- low / medium / high — display labels live in the UI (form + list badge).
  priority     text not null check (priority in ('low','medium','high')) default 'medium',
  due_date     date,
  -- Free-text "אחראי/ת". Kept as text (not a staff FK) so a task can be owned
  -- by anyone, including people who aren't staff records.
  assignee     text,
  -- Optional link to a patient. set null (not cascade delete) so removing a
  -- patient never silently drops the task — it just loses the link.
  patient_id   uuid references patients(id) on delete set null,
  -- The completion flag the "הושלם" checkbox toggles. completed_at is stamped
  -- when it flips to true and cleared when it flips back.
  is_done      boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- For DBs where tasks was created before the category column existed. Safe /
-- idempotent — a no-op once the column is present.
alter table tasks add column if not exists category text;

-- Optional time-of-day for the personal calendar view ("תצוגת לוח שנה") on the
-- task board. Date-only tasks stay valid — time is purely optional.
alter table tasks add column if not exists due_time time;

-- Open tasks first, then by due date (nulls last), newest created first.
create index if not exists idx_tasks_board
  on tasks (is_done, due_date, created_at desc);

-- Auto-bump updated_at (reuses the shared trigger function from schema.sql).
drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();

-- RLS: full access to an authenticated session only (anon denied; service_role
-- bypasses). Same shape as the data-table policies in rls-policies.sql.
alter table tasks enable row level security;
drop policy if exists tasks_authenticated_all on tasks;
create policy tasks_authenticated_all on tasks
  for all to authenticated using (true) with check (true);
