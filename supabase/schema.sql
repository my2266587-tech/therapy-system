-- ====================================================
-- מחר אחר – שדה חמד | Therapy System Database Schema
-- ====================================================
-- Run this in your Supabase SQL Editor to create all tables.
-- Tables are created in dependency order (staff before patients, etc.)

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
  marital_status     text check (marital_status in ('single','married','divorced','widowed')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Patients: import-driven additions (idempotent) ──────────────────────────
-- Denormalized text fields for raw values from imports — used when an FK
-- lookup fails ("רכזת אחראית" name doesn't match a staff row), so the row
-- is still saved with the original text instead of being rejected.
alter table patients add column if not exists team_name        text;
alter table patients add column if not exists coordinator_name text;
alter table patients add column if not exists guide_name       text;
-- jsonb bag for any CSV column we couldn't otherwise map — keeps data
-- safe rather than silently dropping it.
alter table patients add column if not exists import_metadata  jsonb;

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

-- ── Session summaries: import-driven additions (idempotent) ───────────────
alter table session_summaries add column if not exists recording_reference text;
alter table session_summaries add column if not exists import_metadata     jsonb;

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

-- ── Recordings: AI pipeline + summary linkage (idempotent) ────────────────
-- These columns prepare the recordings table for the transcription/AI flow:
--   transcript_text     full Whisper output (longer than the legacy `transcript` field)
--   ai_summary_raw      structured AI output before clinician edits (jsonb)
--   processing_status   granular pipeline state: idle / queued / transcribing /
--                       summarizing / completed / failed
--   processing_error    last error message from the pipeline (for retries)
--   summary_id          FK to session_summaries when the clinician approves
--   duration_seconds    audio length, for the recordings list
alter table recordings add column if not exists transcript_text   text;
alter table recordings add column if not exists ai_summary_raw    jsonb;
alter table recordings add column if not exists processing_status text default 'idle';
alter table recordings add column if not exists processing_error  text;
alter table recordings add column if not exists summary_id        uuid;
alter table recordings add column if not exists duration_seconds  integer;

-- Expand the high-level status enum to include 'transcribing' and 'failed'.
-- Existing rows ('pending'/'transcribed'/'draft_ready'/'approved') stay valid.
alter table recordings drop constraint if exists recordings_status_check;
alter table recordings add constraint recordings_status_check
  check (status in ('pending','transcribing','transcribed','draft_ready','approved','failed'));

-- Optional FK from recording → its created summary. Only attached if not
-- already present, so the migration can be re-run safely.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recordings_summary_id_fkey'
  ) then
    alter table recordings
      add constraint recordings_summary_id_fkey
      foreign key (summary_id) references session_summaries(id) on delete set null;
  end if;
end $$;

-- ── Storage bucket: recordings (private) ───────────────────────────────────
-- Audio files captured from the in-browser RecordingWidget land here. We
-- never expose the service_role key on the client; the API route signs
-- short-lived URLs for playback. 100 MB cap is generous for a typical
-- 60-minute therapy session in compressed webm/m4a/mp3.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  104857600,  -- 100 MB
  array[
    'audio/webm','audio/mp4','audio/x-m4a','audio/mpeg',
    'audio/mp3','audio/wav','audio/x-wav','audio/ogg'
  ]
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Defense-in-depth policies. The API route uses service_role which bypasses
-- RLS, so these are not strictly required. They ensure that even direct
-- access with an anon/authenticated key won't leak audio files.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='recordings_authenticated_read'
  ) then
    create policy recordings_authenticated_read
      on storage.objects for select to authenticated
      using (bucket_id = 'recordings');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='recordings_authenticated_write'
  ) then
    create policy recordings_authenticated_write
      on storage.objects for insert to authenticated
      with check (bucket_id = 'recordings');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='recordings_authenticated_delete'
  ) then
    create policy recordings_authenticated_delete
      on storage.objects for delete to authenticated
      using (bucket_id = 'recordings');
  end if;
end $$;

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

-- ── Payments (שיראל monthly) ──────────────────────────────────────────────────
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

-- ── Petty Cash (מעשה רגל) ────────────────────────────────────────────────────
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

-- ── Import-metadata bag for the rest of the imported tables (idempotent) ──
alter table staff            add column if not exists import_metadata jsonb;
alter table payments         add column if not exists import_metadata jsonb;
alter table private_expenses add column if not exists import_metadata jsonb;

-- ── Patient Documents ────────────────────────────────────────────────────────
-- Files (PDF/Word/images) uploaded per patient. Bytes live in Supabase Storage
-- bucket "patient-documents" (private). This table holds the metadata.
create table if not exists patient_documents (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  file_name    text not null,
  storage_path text not null unique,
  mime_type    text,
  file_size    bigint,
  uploaded_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Safety net for environments where an older version of this table already
-- exists with fewer columns: `create table if not exists` skips the table
-- entirely instead of adding new columns. The ALTERs below close that gap.
alter table patient_documents add column if not exists file_name    text;
alter table patient_documents add column if not exists storage_path text;
alter table patient_documents add column if not exists mime_type    text;
alter table patient_documents add column if not exists file_size    bigint;
alter table patient_documents add column if not exists uploaded_at  timestamptz not null default now();
alter table patient_documents add column if not exists created_at   timestamptz not null default now();
alter table patient_documents add column if not exists updated_at   timestamptz not null default now();

-- Make storage_path unique only if the constraint is missing.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'patient_documents_storage_path_key'
  ) then
    alter table patient_documents add constraint patient_documents_storage_path_key unique (storage_path);
  end if;
end $$;

create index if not exists idx_patient_documents_patient
  on patient_documents (patient_id, uploaded_at desc);

-- Private storage bucket. We never expose the service_role key on the client;
-- the API route signs short-lived URLs for download/preview.
--
-- The cap (10 MB) is enforced both here and in the API route. If the
-- bucket cannot be created via SQL on your Supabase plan, create it manually
-- in Dashboard → Storage with name "patient-documents" and "Public" off.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents',
  'patient-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif'
  ]
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies. The API route already uses the service_role key (which
-- bypasses RLS), so these are not strictly required for the current flows.
-- They are defense-in-depth: if the bucket is ever queried with an anon /
-- authenticated key directly, only authenticated users get through.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'patient_documents_authenticated_read'
  ) then
    create policy patient_documents_authenticated_read
      on storage.objects for select to authenticated
      using (bucket_id = 'patient-documents');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'patient_documents_authenticated_write'
  ) then
    create policy patient_documents_authenticated_write
      on storage.objects for insert to authenticated
      with check (bucket_id = 'patient-documents');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'patient_documents_authenticated_delete'
  ) then
    create policy patient_documents_authenticated_delete
      on storage.objects for delete to authenticated
      using (bucket_id = 'patient-documents');
  end if;
end $$;

-- ── Authorized Users (login access control) ──────────────────────────────────
-- Run this block in Supabase SQL Editor if the table does not exist yet.
create table if not exists authorized_users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  role       text not null check (role in ('admin','staff')) default 'staff',
  is_active  boolean not null default true,
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
    'quarterly_summaries','payments','private_expenses','petty_cash',
    'authorized_users','patient_documents'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on %s for each row execute function update_updated_at();',
      t, t
    );
  end loop;
end;
$$;
