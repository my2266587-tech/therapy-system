-- ── App Settings (UI-editable configuration) ─────────────────────────────────
-- A small key/value store that lets an admin change configurable lists and the
-- Hebrew display labels of system options from the UI — without code changes.
--
-- The application keeps the canonical DEFAULTS in code (lib/settings/defaults.ts).
-- This table stores ONLY admin overrides; the API deep-merges defaults <- DB.
-- A missing/empty table therefore behaves exactly like today (defaults).
--
-- Run this block once in the Supabase SQL Editor.

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- keep updated_at fresh on every write (reuses the shared trigger fn from schema.sql)
drop trigger if exists app_settings_set_updated_at on app_settings;
create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function update_updated_at();

-- RLS: reads allowed to any authenticated user (labels are non-sensitive UI text);
-- writes go through the server (service-role) API which enforces admin-only.
alter table app_settings enable row level security;

drop policy if exists app_settings_read on app_settings;
create policy app_settings_read on app_settings
  for select to authenticated using (true);
