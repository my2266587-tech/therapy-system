# Database (Supabase) SQL files

There is no migration runner: each file is pasted into the Supabase SQL Editor
by hand. Every file is therefore **idempotent** — safe to run again at any time.

## Run order (fresh install)

| # | File | What it adds |
|---|------|--------------|
| 1 | `schema.sql` | Core tables, storage buckets, triggers, RLS (same block as `rls-policies.sql`) |
| 2 | `app-settings.sql` | `app_settings` (admin-editable lists / labels) |
| 3 | `tasks.sql` | Task board |
| 4 | `trips.sql` | Trips + receipts |
| 5 | `hour-bank.sql` | Hour bank |
| 6 | `intake-forms.sql` | Patient intake forms (public link) |
| 7 | `session-reminders.sql` | `sessions.reminder_sent_at` |
| 8 | `shirel-summary-payment.sql` | Auto-payment trigger on new summary |
| 9 | `rls-policies.sql` | **Always last** — access rules for every table |

For an existing database, run only the new/changed file, then `rls-policies.sql`
if a table was added.

`npm run check:sql` builds all of the above on a throwaway local Postgres, twice,
and verifies the access rules. Run it after any SQL change. When adding a file,
add it to the table above **and** to `FILES` in `scripts/check-sql.mjs`.

## Rules for new SQL

- **Idempotent:** `create table if not exists`, `add column if not exists`,
  `create or replace function`, `drop trigger if exists` → `create trigger`,
  `drop policy if exists` → `create policy`.
- **Every new table gets RLS** with the authorized-user check — never
  `using (true)`:

  ```sql
  alter table my_table enable row level security;
  drop policy if exists my_table_authorized on my_table;
  create policy my_table_authorized on my_table
    for all to authenticated
    using ((select public.is_authorized_user()))
    with check ((select public.is_authorized_user()));
  ```

  Owner-only data: `public.is_admin_user()` instead. Server-only data: RLS on,
  no policy (the service role bypasses RLS). Also add the table to the list in
  `rls-policies.sql` (and the identical block at the end of `schema.sql`).
- **Storage buckets are private.** Files are served through API routes with
  short-lived signed URLs, never public links.
