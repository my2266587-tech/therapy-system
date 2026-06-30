-- ── Intake (join) forms — "טופס הצטרפות" ────────────────────────────────────
--
-- One focused table backing the digital intake form. A form is created per
-- patient (with an unguessable token for the external personal link) and is
-- filled either by the patient (via the link) or by the therapist (from inside
-- the system). Answers + per-question audio + a signature image are stored, a
-- summary PDF is filed into the EXISTING patient_documents mechanism under the
-- category "טופס הצטרפות".
--
-- Storage reuse (no new buckets):
--   • PDF        → bucket "patient-documents" (+ a patient_documents row)
--   • signature  → bucket "patient-documents" (image/png, no row — referenced here)
--   • recordings → bucket "recordings"        (audio/webm, referenced from answers jsonb)
--
-- Access: only the server (service_role) ever touches this table — both the
-- authenticated patient-card endpoints and the public token submit endpoint.
-- RLS is therefore enabled with NO policies (deny-all to anon/authenticated),
-- mirroring the authorized_users table. service_role bypasses RLS.
--
-- Idempotent — safe to re-run.

-- The intake form is filled for a NOT-YET-EXISTING patient: a new patient
-- record is created on submit and linked back here. patient_id is therefore
-- nullable until submission.
create table if not exists intake_forms (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid references patients(id) on delete cascade,
  token              text not null unique,
  status             text not null check (status in ('pending','submitted')) default 'pending',
  filled_by          text check (filled_by in ('patient','therapist')),
  filled_by_email    text,
  -- answers: [{ "id": "...", "question": "...", "text": "...", "audio_path": "..."|null }]
  answers            jsonb,
  signature_path     text,
  pdf_document_id    uuid references patient_documents(id) on delete set null,
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- For DBs where the table was first created with a NOT NULL patient_id, relax
-- it (the patient is created on submit). Safe / idempotent.
alter table intake_forms alter column patient_id drop not null;

create index if not exists idx_intake_forms_patient
  on intake_forms (patient_id, created_at desc);

create index if not exists idx_intake_forms_token
  on intake_forms (token);

-- Auto-bump updated_at (reuses the shared trigger function from schema.sql).
drop trigger if exists trg_intake_forms_updated_at on intake_forms;
create trigger trg_intake_forms_updated_at
  before update on intake_forms
  for each row execute function update_updated_at();

-- Deny-all RLS (service_role bypasses). No policies on purpose.
alter table intake_forms enable row level security;

-- ── patient_documents: optional category tag ───────────────────────────────
-- The existing documents mechanism has no category concept. Add a nullable
-- tag so the intake PDF can be filed under "טופס הצטרפות" while remaining a
-- normal document (it still shows in the Documents tab). Existing rows stay
-- NULL and behave exactly as before.
alter table patient_documents add column if not exists category text;
