-- ============================================================================
-- Fixed weekly slots in the calendar
-- ============================================================================
-- Data script (not schema) — run in the Supabase SQL Editor (production).
-- Safe to re-run: a re-run starts again from tomorrow, so it also extends the
-- series by another WEEKS weeks.
--
--   שרה צייטקין  Wednesday 12:00–13:00
--   אודליה       Wednesday 13:00–14:00
--   אבישג        Tuesday   14:00–15:00
--
-- The calendar is driven by `sessions` rows only (there is no recurrence
-- rule), so "fixed" = one planned row per week, from tomorrow for WEEKS weeks.
--
-- For each of these patients it also removes her FUTURE (from tomorrow)
-- planned sessions on Tuesday/Wednesday at any other time — the old rotating
-- slots — so the calendar doesn't show both. Never touched: past/today
-- sessions, sessions that are completed / cancelled / no_show, sessions that
-- a summary is linked to, and sessions on other weekdays.
--
-- Each patient is matched by name among the patients table; if a name matches
-- no patient or more than one, the whole script stops and changes nothing.
-- ============================================================================

do $$
declare
  weeks    constant int  := 26;   -- ~6 months ahead
  tomorrow constant date := (now() at time zone 'Asia/Jerusalem')::date + 1;
  slot     record;
  pid      uuid;
  matches  int;
  names    text;
  first_d  date;
  removed  int;
  added    int;
begin
  for slot in
    select * from (values
      ('שרה צייטקין', '%שרה%צייטקין%', 3, time '12:00', time '13:00'),
      ('אודליה',      '%אודליה%',      3, time '13:00', time '14:00'),
      ('אבישג',       '%אבישג%',       2, time '14:00', time '15:00')
    ) as v(label, pattern, dow, start_t, end_t)
  loop
    select count(*), string_agg(full_name, ', ')
      into matches, names
      from patients where full_name ilike slot.pattern;
    if matches <> 1 then
      raise exception 'המטופלת "%" נמצאה % פעמים (%). לא בוצע שינוי.',
        slot.label, matches, coalesce(names, '—');
    end if;
    select id into pid from patients where full_name ilike slot.pattern;

    delete from sessions s
     where s.patient_id = pid
       and s.status = 'planned'
       and s.date >= tomorrow
       and extract(dow from s.date) in (2, 3)
       and not (extract(dow from s.date) = slot.dow and s.start_time = slot.start_t)
       and not exists (select 1 from session_summaries ss where ss.session_id = s.id);
    get diagnostics removed = row_count;

    -- First occurrence of the weekday on/after tomorrow (dow: 0=Sun … 6=Sat).
    first_d := tomorrow + ((slot.dow - extract(dow from tomorrow)::int + 7) % 7);

    insert into sessions (patient_id, date, start_time, end_time, duration_minutes, status)
    select pid, d::date, slot.start_t, slot.end_t,
           extract(epoch from (slot.end_t - slot.start_t))::int / 60, 'planned'
      from generate_series(first_d, first_d + (weeks - 1) * 7, interval '7 days') as d
     where not exists (
       select 1 from sessions s
        where s.patient_id = pid and s.date = d::date and s.start_time = slot.start_t);
    get diagnostics added = row_count;

    raise notice '%: נוספו % פגישות, הוסרו % פגישות ישנות', slot.label, added, removed;
  end loop;
end $$;
