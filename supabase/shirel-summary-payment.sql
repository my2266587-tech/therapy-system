-- ============================================================================
-- Auto-payment for שיראל session summaries
-- ============================================================================
-- Run this once in the Supabase SQL Editor (production). It is idempotent and
-- safe to re-run. This same block is also appended to schema.sql so fresh
-- installs get it automatically — the two are kept identical.
--
-- Business rule: whenever a *new* session summary is created for a patient
-- whose assigned therapist is שיראל, record one unpaid ₪150 payment in the
-- existing payments module ("תשלומי שיראל"). Mapping the request onto the
-- existing table (no new module, smallest safe change):
--   • category "תשלומים שיראל" → the payments table is wholly שיראל's payments;
--                                the new `summary_id` link marks the rows that
--                                were auto-created from a summary (vs. the
--                                manually-entered monthly coordinator rows).
--   • status   "לא שולם"       → is_paid = false. The PaymentForm "האם שולם"
--                                toggle flips it to שולם — that UI already exists.
--   • amount   → 150 ;  month → YYYY-MM of the summary date.
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
  -- Is this summary's patient treated by שיראל? Check the primary therapist
  -- (patients.staff_id) and any secondary assignment (staff_patients). Name is
  -- a contains-match — the business has a single therapist named שיראל and the
  -- payments module is named after her.
  if exists (
    select 1
    from patients p
    where p.id = new.patient_id
      and (
        exists (select 1 from staff s
                 where s.id = p.staff_id and s.full_name like '%שיראל%')
        or exists (select 1 from staff_patients sp
                   join staff s on s.id = sp.staff_id
                   where sp.patient_id = p.id and s.full_name like '%שיראל%')
      )
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
