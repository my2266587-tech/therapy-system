-- ── Session reminder stamp ──────────────────────────────────────────────────
--
-- "שליחת תזכורת" in the appointments calendar: after the clinician sends a
-- reminder (WhatsApp / email / copied text), the session is stamped so the
-- UI can show "תזכורת נשלחה" with the date and time. Manual sending only —
-- no automatic sending / SMS system at this stage.
--
-- Run this block once in the Supabase SQL Editor. Idempotent — safe to re-run.

alter table sessions add column if not exists reminder_sent_at timestamptz;
