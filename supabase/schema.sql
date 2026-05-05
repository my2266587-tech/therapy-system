-- ====================================================
-- מחר אחר – שדה חמד | Therapy System Database Schema
-- ====================================================
-- הרץ קובץ זה ב-SQL Editor של Supabase כדי ליצור את כל הטבלאות

create extension if not exists "pgcrypto";

-- ── Staff ─────────────────────────────────────────────────────────────────────
create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  email       text,
  role        text not null check (role in ('coordinator','instructor','therapist','other')) default 'other',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Patients ──────────────────────────────────────────────────────────────────
create table if not exists patients (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  phone              text,
  email              text,
  status             text not null check (status in ('active','inactive','waiting')) default 'active',
  coordinator_id     uuid references staff(id) on delete set null,
  staff_id           uuid references staff(id) on delete set null,
  apartment_address  text,
  housing_type       text check (housing_type in ('independent','regular','rehabilitation')),
  father_name        text,
  mother_name        text,
  family_position    text,
  home_address       text,
  marital_status     text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Sessions ──────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references patients(id) on delete cascade,
  date             date not null,
  start_time       time not null,
  end_time         time not null,
  duration_minutes integer,
  status           text not null check (status in ('planned','completed','cancelled','no_show')) default 'planned',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Session Summaries ─────────────────────────────────────────────────────────
create table if not exists session_summaries (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references patients(id) on delete cascade,
  session_id         uuid references sessions(id) on delete set null,
  date               date not null,
  start_time         time,
  end_time           time,
  duration_minutes   integer,
  current_state      text,
  main_topics        text,
  treatment_actions  text,
  next_steps         text,
  tasks_given        text,
  progress           text,
  difficulties       text,
  notes              text,
  attachment_url     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Recordings ────────────────────────────────────────────────────────────────
create table if not exists recordings (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references patients(id) on delete cascade,
  recorded_at   timestamptz not null default now(),
  audio_url     text,
  transcript    text,
  draft_summary text,
  status        text not null check (status in ('pending','transcribed','draft_ready','approved')) default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Quarterly Summaries ───────────────────────────────────────────────────────
create table if not exists quarterly_summaries (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references patients(id) on delete cascade,
  date             date not null,
  participants     text,
  summary          text,
  duration_minutes integer,
  attachment_url   text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Payments ──────────────────────────────────────────────────────────────────
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  month          text not null,
  amount         numeric(10,2) not null default 0,
  is_paid        boolean not null default false,
  payment_method text check (payment_method in ('bank_transfer','cash','check','other')),
  received_date  date,
  coordinator_id uuid references staff(id) on delete set null,
  email_status   text not null check (email_status in ('not_sent','sent','failed')) default 'not_sent',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Private Expenses ──────────────────────────────────────────────────────────
create table if not exists private_expenses (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references patients(id) on delete cascade,
  date           date not null,
  treatment_type text not null,
  materials      text,
  details        text,
  cost           numeric(10,2) not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Petty Cash ────────────────────────────────────────────────────────────────
create table if not exists petty_cash (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  amount     numeric(10,2) not null default 0,
  purpose    text not null,
  patient_id uuid references patients(id) on delete set null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Auto-update updated_at trigger ───────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'staff','patients','sessions','session_summaries','recordings',
    'quarterly_summaries','payments','private_expenses','petty_cash'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on %s for each row execute function update_updated_at();',
      t, t
    );
  end loop;
end;
$$;
