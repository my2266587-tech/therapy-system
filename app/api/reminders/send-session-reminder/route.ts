/**
 * POST /api/reminders/send-session-reminder
 *
 *   Sends ONE session-reminder email to the patient, directly from the
 *   system — no mail client popup. Triggered by the "שליחה במייל" button
 *   in the calendar's reminder bar.
 *
 *   Body: { session_id: string }
 *   Auth: Bearer token of an active authorized user (admin OR staff).
 *
 *   The message is built SERVER-SIDE from the session + patient rows (so
 *   the client can't alter the recipient or content):
 *     "שלום [שם], תזכורת לפגישה שנקבעה לתאריך [תאריך] בשעה [שעה]."
 *
 *   Transport: Gmail SMTP via Nodemailer — the exact same transport and
 *   env vars as /api/reminders/sessions-tomorrow (GMAIL_USER +
 *   GMAIL_APP_PASSWORD; Resend is unsuitable because it blocks unverified
 *   recipient domains).
 *
 *   On success the route also stamps sessions.reminder_sent_at and returns
 *   { ok, sent_at, to } so the UI can show "תזכורת נשלחה".
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

export const maxDuration = 30;

const TAG = '[send-session-reminder]';

/** "DD/MM/YYYY" from ISO, no timezone drift. */
function ddmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
/** "HH:MM" from a time column value. */
function hm(t: string | null | undefined): string { return t ? t.slice(0, 5) : ''; }

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });

  const gmailUser     = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPassword) {
    return NextResponse.json(
      { error: 'שליחת מייל אינה מוגדרת בשרת (GMAIL_USER / GMAIL_APP_PASSWORD חסרים)' },
      { status: 503 },
    );
  }

  let body: { session_id?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  if (!sessionId) return NextResponse.json({ error: 'שדה "session_id" חסר' }, { status: 400 });

  const supabase = createServerClient();

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, date, start_time, patient:patient_id(full_name, email)')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) {
    console.error(`${TAG} session lookup failed:`, sErr.message);
    return NextResponse.json({ error: 'שגיאה בשליפת הפגישה' }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: 'הפגישה לא נמצאה' }, { status: 404 });

  const patient = session.patient as unknown as { full_name: string; email: string | null } | null;
  if (!patient) return NextResponse.json({ error: 'לא נמצאה מטופלת לפגישה' }, { status: 404 });
  if (!patient.email) {
    return NextResponse.json({ error: 'אין כתובת מייל שמורה בכרטיס המטופלת' }, { status: 400 });
  }

  const message =
    `שלום ${patient.full_name}, תזכורת לפגישה שנקבעה לתאריך ${ddmmyyyy(session.date)} בשעה ${hm(session.start_time)}.`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 15px; color: #1A2332; line-height: 1.7;">
      <p>${message}</p>
      <p style="color:#64748B; font-size:12px; margin-top:24px;">הודעה זו נשלחה ממערכת מחר אחר – שדה חמד.</p>
    </div>`;

  // Same fixed Gmail SMTP transport as the day-before reminder route.
  const transporter = nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   465,
    secure: true,
    auth: {
      user: gmailUser,
      // Google ignores spaces in the displayed 16-char password; Nodemailer doesn't.
      pass: gmailPassword.replace(/\s+/g, ''),
    },
  });

  const fromName = process.env.REMINDER_EMAIL_FROM_NAME || 'מערכת מחר אחר';
  try {
    await transporter.sendMail({
      from:    `"${fromName}" <${gmailUser}>`,
      to:      patient.email,
      subject: 'תזכורת לפגישה',
      text:    message,
      html,
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`${TAG} send failed:`, msg);
    if (/Invalid login|Username and Password not accepted/i.test(msg)) {
      return NextResponse.json(
        { error: 'Gmail דחה את הזיהוי — יש לבדוק את GMAIL_APP_PASSWORD בהגדרות השרת' },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: 'שליחת המייל נכשלה. נסי שוב.' }, { status: 502 });
  }

  // Stamp the session so the UI can show "תזכורת נשלחה" (best-effort —
  // the mail is already out; a stamp failure shouldn't read as send failure).
  const sentAt = new Date().toISOString();
  const { error: upErr } = await supabase
    .from('sessions')
    .update({ reminder_sent_at: sentAt })
    .eq('id', sessionId);
  if (upErr) console.error(`${TAG} stamp failed:`, upErr.message);

  console.log(`${TAG} sent to ${patient.email} for session ${sessionId} by ${user.email}`);
  return NextResponse.json({ ok: true, sent_at: sentAt, to: patient.email });
}
