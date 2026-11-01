-- ============================================================================
-- A session that has a summary is a session that took place ("התקיימה")
-- ============================================================================
-- Run this once in the Supabase SQL Editor (production). It is idempotent and
-- safe to re-run.
--
-- Which session does a summary belong to?
--   1. The summary's own link (session_summaries.session_id) — any status
--      (planned / cancelled / no_show) becomes completed, because the clinician
--      explicitly tied the summary to that session.
--   2. No link (e.g. summaries approved from a phone draft): a PLANNED session
--      of the same patient on the same date. Cancelled / no_show sessions are
--      left alone here, since the match is only by date.
--
-- Part A fixes the existing rows; part B keeps it true for every new summary
-- (both the UI form and the phone-draft approval insert into session_summaries).
-- ============================================================================

-- A. One-time backfill of the existing data.
update sessions s
   set status = 'completed'
 where s.status <> 'completed'
   and exists (select 1 from session_summaries ss where ss.session_id = s.id);

update sessions s
   set status = 'completed'
 where s.status = 'planned'
   and exists (
     select 1 from session_summaries ss
      where ss.session_id is null
        and ss.patient_id = s.patient_id
        and ss.date = s.date
   );

-- B. Trigger: on a new summary, or when its session link / date changes.
--    SECURITY DEFINER so it works for the browser insert and the service-role
--    insert alike.
create or replace function mark_session_completed_on_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is not null then
    update sessions
       set status = 'completed'
     where id = new.session_id
       and status <> 'completed';
  else
    update sessions
       set status = 'completed'
     where patient_id = new.patient_id
       and date = new.date
       and status = 'planned';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_session_completed_on_summary on session_summaries;
create trigger trg_session_completed_on_summary
  after insert or update of session_id, patient_id, date on session_summaries
  for each row
  execute function mark_session_completed_on_summary();
