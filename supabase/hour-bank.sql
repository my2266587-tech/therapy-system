-- ── Hour Bank — "בנק שעות" ─────────────────────────────────────────────────
--
-- A SINGLE work-hours bank for the clinician's work against the client. NOT a
-- general attendance system — there is exactly one bank (a singleton row).
--
-- What it tracks:
--   • quota_seconds  — total hours GRANTED (base quota + reloads + manual adds)
--   • used_seconds   — total hours CONSUMED (work timers + manual subtractions)
--   • remaining      — quota_seconds − used_seconds (derived, never stored)
--   • last_loaded_at — when the bank was last reloaded
--   • a full ledger of loads / work / manual corrections (hour_bank_transactions)
--   • individual work records (work_time_entries)
--
-- ── Server-side timer ───────────────────────────────────────────────────────
-- The "timer" is just a timestamp: hour_banks.active_started_at. Starting sets
-- it to now() ON THE SERVER; stopping computes the exact duration from the
-- server clock (now() − active_started_at) and files a work_time_entries row.
-- Because the state lives in the DB, the timer keeps running across refresh /
-- tab-close / device-change, and — since there is one bank — only ONE timer can
-- ever be active at a time (enforced again by an explicit guard in _start).
--
-- All mutations go through SECURITY DEFINER RPCs so the server clock is the
-- single source of truth and each change is atomic + audited. The acting user
-- is derived server-side from the JWT (auth.jwt() ->> 'email'), so it can't be
-- spoofed by the browser.
--
-- Reads happen directly from the browser via the authenticated Supabase client
-- (same pattern as tasks/sessions), so RLS grants authenticated full read and
-- denies anon (service_role bypasses RLS). Mirrors rls-policies.sql.
--
-- Run this block once in the Supabase SQL Editor. Idempotent — safe to re-run.
-- All amounts are stored in SECONDS (integers) — never a decimal number of
-- hours — so arithmetic stays exact.

create extension if not exists "pgcrypto";

-- Base quota shipped by default: 5 hours = 18000 seconds.
-- (Kept inline in the functions below; changing it here is documentation only.)

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists hour_banks (
  id                uuid primary key default gen_random_uuid(),
  -- Total seconds ever granted to the bank (base quota + reloads + manual adds).
  quota_seconds     bigint not null default 18000,
  -- Total seconds consumed (completed work timers + manual subtractions).
  used_seconds      bigint not null default 0,
  -- When the bank was last (re)loaded. Null only before the very first load.
  last_loaded_at    timestamptz,
  -- Non-null ⇒ a timer is currently running, started at this server timestamp.
  active_started_at timestamptz,
  -- Optional note captured when the timer was started (editable again on stop).
  active_note       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One row per completed work session.
create table if not exists work_time_entries (
  id               uuid primary key default gen_random_uuid(),
  bank_id          uuid not null references hour_banks(id) on delete cascade,
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  duration_seconds bigint not null default 0,
  -- Optional note on what was done.
  note             text,
  -- Email of the user who performed the work (from the JWT, server-derived).
  performed_by     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_work_time_entries_bank
  on work_time_entries (bank_id, started_at desc);

-- Append-only audit ledger. Every load, work stop, and manual correction adds a
-- row here. amount_seconds is SIGNED: positive = added to the balance,
-- negative = removed from the balance.
create table if not exists hour_bank_transactions (
  id             uuid primary key default gen_random_uuid(),
  bank_id        uuid not null references hour_banks(id) on delete cascade,
  -- Set for rows that came from a work timer. on delete set null so removing an
  -- entry doesn't erase the ledger line.
  entry_id       uuid references work_time_entries(id) on delete set null,
  type           text not null check (type in (
                    'load_reset',       -- reload: reset quota, zero usage
                    'load_add',         -- reload: added to existing balance
                    'manual_add',       -- manual correction: time added
                    'manual_subtract',  -- manual correction: time removed
                    'work',             -- a work timer was stopped
                    'entry_edit',       -- a work record's duration was edited
                    'entry_delete'      -- a work record was deleted (time refunded)
                  )),
  amount_seconds bigint not null,
  note           text,
  performed_by   text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_hour_bank_tx_bank
  on hour_bank_transactions (bank_id, created_at desc);

-- ── updated_at auto-bump (reuses the shared trigger fn from schema.sql) ──────
drop trigger if exists trg_hour_banks_updated_at on hour_banks;
create trigger trg_hour_banks_updated_at
  before update on hour_banks
  for each row execute function update_updated_at();

drop trigger if exists trg_work_time_entries_updated_at on work_time_entries;
create trigger trg_work_time_entries_updated_at
  before update on work_time_entries
  for each row execute function update_updated_at();

-- ── RLS: authenticated full access; anon denied; service_role bypasses ───────
alter table hour_banks             enable row level security;
alter table work_time_entries      enable row level security;
alter table hour_bank_transactions enable row level security;

drop policy if exists hour_banks_authenticated_all on hour_banks;
create policy hour_banks_authenticated_all on hour_banks
  for all to authenticated using (true) with check (true);

drop policy if exists work_time_entries_authenticated_all on work_time_entries;
create policy work_time_entries_authenticated_all on work_time_entries
  for all to authenticated using (true) with check (true);

drop policy if exists hour_bank_transactions_authenticated_all on hour_bank_transactions;
create policy hour_bank_transactions_authenticated_all on hour_bank_transactions
  for all to authenticated using (true) with check (true);

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs — every mutation. SECURITY DEFINER + a per-transaction advisory lock so
-- the singleton-bank invariant and the single-active-timer rule hold even under
-- concurrent calls. search_path pinned to public to keep SECURITY DEFINER safe.
-- ════════════════════════════════════════════════════════════════════════════

-- Fetch (creating on first use) the singleton bank. Called on page load.
create or replace function hour_bank_get()
returns hour_banks
language plpgsql security definer set search_path = public as $$
declare v hour_banks;
begin
  perform pg_advisory_xact_lock(hashtext('hour_bank_singleton'));
  select * into v from hour_banks order by created_at limit 1;
  if not found then
    insert into hour_banks (quota_seconds, used_seconds, last_loaded_at)
      values (18000, 0, now())
      returning * into v;
    insert into hour_bank_transactions (bank_id, type, amount_seconds, note, performed_by)
      values (v.id, 'load_reset', 18000, 'טעינה ראשונית',
              coalesce(nullif(auth.jwt() ->> 'email', ''), 'system'));
  end if;
  return v;
end $$;

-- Start the work timer. Fails if one is already running or the bank is empty.
create or replace function hour_bank_start(p_note text default null)
returns hour_banks
language plpgsql security definer set search_path = public as $$
declare v hour_banks;
begin
  perform pg_advisory_xact_lock(hashtext('hour_bank_singleton'));
  select * into v from hour_banks order by created_at limit 1;
  if not found then
    insert into hour_banks (quota_seconds, used_seconds, last_loaded_at)
      values (18000, 0, now()) returning * into v;
  end if;

  if v.active_started_at is not null then
    raise exception 'TIMER_ALREADY_RUNNING';
  end if;
  if (v.quota_seconds - v.used_seconds) <= 0 then
    raise exception 'NO_HOURS_LEFT';
  end if;

  update hour_banks
    set active_started_at = now(),
        active_note       = nullif(btrim(coalesce(p_note, '')), '')
    where id = v.id
    returning * into v;
  return v;
end $$;

-- Stop the running timer: compute exact duration on the server clock, file a
-- work record, deduct from the bank, and ledger it. Returns the new entry.
create or replace function hour_bank_stop(p_note text default null)
returns work_time_entries
language plpgsql security definer set search_path = public as $$
declare
  v       hour_banks;
  e       work_time_entries;
  v_start timestamptz;
  v_end   timestamptz;
  v_dur   bigint;
  v_by    text;
  v_note  text;
begin
  perform pg_advisory_xact_lock(hashtext('hour_bank_singleton'));
  select * into v from hour_banks order by created_at limit 1;
  if not found or v.active_started_at is null then
    raise exception 'NO_ACTIVE_TIMER';
  end if;

  v_by    := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');
  v_start := v.active_started_at;
  v_end   := now();
  v_dur   := greatest(0, round(extract(epoch from (v_end - v_start))))::bigint;
  v_note  := nullif(btrim(coalesce(p_note, v.active_note, '')), '');

  insert into work_time_entries (bank_id, started_at, ended_at, duration_seconds, note, performed_by)
    values (v.id, v_start, v_end, v_dur, v_note, v_by)
    returning * into e;

  update hour_banks
    set used_seconds      = used_seconds + v_dur,
        active_started_at = null,
        active_note       = null
    where id = v.id;

  insert into hour_bank_transactions (bank_id, entry_id, type, amount_seconds, note, performed_by)
    values (v.id, e.id, 'work', -v_dur, v_note, v_by);

  return e;
end $$;

-- Reload the bank. p_mode: 'add' = add to the existing balance,
-- 'reset' = start a fresh quota (zeroing usage).
create or replace function hour_bank_reload(p_seconds bigint, p_mode text)
returns hour_banks
language plpgsql security definer set search_path = public as $$
declare v hour_banks; v_by text;
begin
  if p_seconds is null or p_seconds < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_mode not in ('add', 'reset')      then raise exception 'INVALID_MODE';   end if;

  perform pg_advisory_xact_lock(hashtext('hour_bank_singleton'));
  select * into v from hour_banks order by created_at limit 1;
  if not found then
    insert into hour_banks (quota_seconds, used_seconds, last_loaded_at)
      values (18000, 0, now()) returning * into v;
  end if;
  v_by := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');

  if p_mode = 'add' then
    update hour_banks
      set quota_seconds = quota_seconds + p_seconds, last_loaded_at = now()
      where id = v.id returning * into v;
    insert into hour_bank_transactions (bank_id, type, amount_seconds, performed_by)
      values (v.id, 'load_add', p_seconds, v_by);
  else
    update hour_banks
      set quota_seconds = p_seconds, used_seconds = 0, last_loaded_at = now()
      where id = v.id returning * into v;
    insert into hour_bank_transactions (bank_id, type, amount_seconds, performed_by)
      values (v.id, 'load_reset', p_seconds, v_by);
  end if;
  return v;
end $$;

-- Manual correction. p_direction: 'add' grows the balance, 'subtract' shrinks it.
create or replace function hour_bank_adjust(p_seconds bigint, p_direction text, p_note text default null)
returns hour_banks
language plpgsql security definer set search_path = public as $$
declare v hour_banks; v_by text; v_note text;
begin
  if p_seconds is null or p_seconds <= 0    then raise exception 'INVALID_AMOUNT';    end if;
  if p_direction not in ('add', 'subtract') then raise exception 'INVALID_DIRECTION'; end if;

  perform pg_advisory_xact_lock(hashtext('hour_bank_singleton'));
  select * into v from hour_banks order by created_at limit 1;
  if not found then
    insert into hour_banks (quota_seconds, used_seconds, last_loaded_at)
      values (18000, 0, now()) returning * into v;
  end if;
  v_by   := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');
  v_note := nullif(btrim(coalesce(p_note, '')), '');

  if p_direction = 'add' then
    update hour_banks set quota_seconds = quota_seconds + p_seconds
      where id = v.id returning * into v;
    insert into hour_bank_transactions (bank_id, type, amount_seconds, note, performed_by)
      values (v.id, 'manual_add', p_seconds, v_note, v_by);
  else
    update hour_banks set used_seconds = used_seconds + p_seconds
      where id = v.id returning * into v;
    insert into hour_bank_transactions (bank_id, type, amount_seconds, note, performed_by)
      values (v.id, 'manual_subtract', -p_seconds, v_note, v_by);
  end if;
  return v;
end $$;

-- Edit a work record's start/end/note. The duration is recomputed from the new
-- range and the difference is reconciled against the bank's used_seconds.
create or replace function hour_bank_update_entry(
  p_entry_id   uuid,
  p_started_at timestamptz,
  p_ended_at   timestamptz,
  p_note       text
)
returns work_time_entries
language plpgsql security definer set search_path = public as $$
declare e work_time_entries; old_dur bigint; new_dur bigint; delta bigint; v_by text;
begin
  if p_started_at is null or p_ended_at is null then raise exception 'INVALID_RANGE'; end if;
  if p_ended_at < p_started_at                  then raise exception 'INVALID_RANGE'; end if;

  perform pg_advisory_xact_lock(hashtext('hour_bank_singleton'));
  select * into e from work_time_entries where id = p_entry_id;
  if not found then raise exception 'ENTRY_NOT_FOUND'; end if;

  old_dur := e.duration_seconds;
  new_dur := greatest(0, round(extract(epoch from (p_ended_at - p_started_at))))::bigint;
  delta   := new_dur - old_dur;
  v_by    := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');

  update work_time_entries
    set started_at       = p_started_at,
        ended_at         = p_ended_at,
        duration_seconds = new_dur,
        note             = nullif(btrim(coalesce(p_note, '')), '')
    where id = e.id
    returning * into e;

  update hour_banks set used_seconds = greatest(0, used_seconds + delta)
    where id = e.bank_id;

  insert into hour_bank_transactions (bank_id, entry_id, type, amount_seconds, note, performed_by)
    values (e.bank_id, e.id, 'entry_edit', -delta, e.note, v_by);

  return e;
end $$;

-- Delete a work record and refund its time to the bank.
create or replace function hour_bank_delete_entry(p_entry_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e work_time_entries; v_by text;
begin
  perform pg_advisory_xact_lock(hashtext('hour_bank_singleton'));
  select * into e from work_time_entries where id = p_entry_id;
  if not found then return; end if;
  v_by := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');

  update hour_banks set used_seconds = greatest(0, used_seconds - e.duration_seconds)
    where id = e.bank_id;

  insert into hour_bank_transactions (bank_id, type, amount_seconds, note, performed_by)
    values (e.bank_id, 'entry_delete', e.duration_seconds, e.note, v_by);

  delete from work_time_entries where id = e.id;
end $$;

-- ── Function privileges ─────────────────────────────────────────────────────
-- Lock the RPCs down to signed-in users. Default Postgres grants EXECUTE to
-- PUBLIC, which for SECURITY DEFINER functions would let the anon role in — so
-- revoke, then grant to authenticated + service_role only.
do $$
declare fn text;
begin
  foreach fn in array array[
    'hour_bank_get()',
    'hour_bank_start(text)',
    'hour_bank_stop(text)',
    'hour_bank_reload(bigint, text)',
    'hour_bank_adjust(bigint, text, text)',
    'hour_bank_update_entry(uuid, timestamptz, timestamptz, text)',
    'hour_bank_delete_entry(uuid)'
  ] loop
    execute format('revoke all on function %s from public;', fn);
    execute format('grant execute on function %s to authenticated, service_role;', fn);
  end loop;
end $$;
