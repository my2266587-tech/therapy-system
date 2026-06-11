-- ============================================================================
-- Auto-payment for the patient שיראל's session summaries
-- ============================================================================
-- Run this once in the Supabase SQL Editor (production). It is idempotent and
-- safe to re-run. This same block is also appended to schema.sql so fresh
-- installs get it automatically — the two are kept identical.
--
-- Business rule: whenever a *new* session summary is created for the PATIENT
-- whose name is שיראל, record one unpaid ₪150 payment in the existing payments
-- module ("תשלומי שיראל"). Mapping the request onto the existing table (no new
-- module, smallest safe change):
--   • category "תשלומים שיראל" → the payments table is wholly שיראל's payments;
--                                the new `summary_id` link marks the rows that
--                                were auto-created from a summary (vs. the
--                                manually-entered monthly coordinator rows).
--   • status   "לא שולם"       → is_paid = false. The PaymentForm "האם שולם"
--                                toggle flips it to שולם — that UI already exists.
--   • amount   → 150 ;  month → YYYY-MM of the summary date.
--   • notes    → free-text "הערות", editable in the payments UI.
--
-- Match is on the PATIENT, not on any therapist/staff: the summary links to a
-- patient via patient_id and patients.full_name is text NOT NULL, so we match
-- it exactly (trimmed). staff_id / staff_patients are NOT consulted.
--
-- Covers BOTH summary-creation flows at once because both INSERT into
-- session_summaries: (1) the regular UI form (components/summaries/SummaryForm)
-- and (2) the Yemot phone-draft approval (app/api/admin/phone-drafts/[id]/
-- approve). Fires on INSERT only, so EDITING a summary never adds a 2nd payment.
-- A unique index on summary_id + ON CONFLICT DO NOTHING enforces
-- one-summary → one-payment even under a race or a re-run.
-- ============================================================================

-- 1. Link column: which summary produced this payment (NULL for the manual
--    monthly rows). ON DELETE SET NULL keeps the financial record even if the
--    source summary is later removed.
alter table payments add column if not exists summary_id uuid
  references session_summaries(id) on delete set null;

-- 1b. Free-text notes ("הערות") — shown and editable in the payments UI.
alter table payments add column if not exists notes text;

-- 2. One payment per summary. A plain unique index still allows many NULLs
--    (the manual rows) and doubles as the ON CONFLICT arbiter below.
create unique index if not exists payments_summary_id_key
  on payments (summary_id);

-- 3. Trigger function. SECURITY DEFINER so it runs regardless of the caller's
--    role — works for the authenticated browser insert (UI form) and the
--    service-role insert (phone approval / cron) alike.
create or replace function create_shirel_payment_for_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Does this summary belong to the PATIENT named שיראל? The summary links to
  -- a patient via patient_id; patients.full_name is text NOT NULL (a reliable
  -- field), so we match it exactly (trimmed). No therapist/staff lookup here.
  if exists (
    select 1 from patients p
    where p.id = new.patient_id
      and trim(p.full_name) = 'שיראל אלמקייס'
  ) then
    insert into payments (month, amount, is_paid, summary_id)
    values (to_char(new.date, 'YYYY-MM'), 150, false, new.id)
    on conflict (summary_id) do nothing;
  end if;

  return new;
end;
$$;

-- 4. Bind the trigger (AFTER INSERT). Drop-then-create keeps it idempotent.
drop trigger if exists trg_shirel_payment_on_summary on session_summaries;
create trigger trg_shirel_payment_on_summary
  after insert on session_summaries
  for each row
  execute function create_shirel_payment_for_summary();
