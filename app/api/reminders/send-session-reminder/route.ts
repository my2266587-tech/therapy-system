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

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
/** "יום רביעי" from an ISO date, timezone-safe (parsed as local midnight). */
function hebrewDayName(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `יום ${HEBREW_DAYS[d.getDay()]}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * RTL HTML email in the same visual language as the system's day-before
 * reminder: teal gradient header, white rounded card, quiet footer.
 * Table-based + inline styles so it renders correctly in Gmail/Outlook.
 */
function renderReminderEmail(opts: {
  patientName: string;
  dateLabel: string;   // DD/MM/YYYY
  dayLabel: string;    // יום רביעי
  timeLabel: string;   // HH:MM
}): string {
  const { patientName, dateLabel, dayLabel, timeLabel } = opts;
  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>תזכורת לפגישה</title>
</head>
<body style="margin:0;padding:0;background:#F6F8FB;direction:rtl;font-family:Arial,Helvetica,'Heebo','Open Sans Hebrew',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F6F8FB;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
               style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 14px rgba(15,23,42,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0D9488 0%,#0F766E 100%);padding:26px 32px;" dir="rtl">
              <div style="font-size:12px;color:rgba(255,255,255,0.78);font-weight:600;letter-spacing:0.10em;margin-bottom:6px;">
                מחר אחר – שדה חמד
              </div>
              <h1 style="margin:0;color:#FFFFFF;font-size:23px;font-weight:700;letter-spacing:-0.01em;">
                תזכורת לפגישה
              </h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:26px 32px 6px;" dir="rtl">
              <div style="font-size:16px;font-weight:700;color:#0F172A;margin-bottom:6px;">
                שלום ${escapeHtml(patientName)},
              </div>
              <div style="font-size:14px;color:#475569;line-height:1.7;">
                תזכורת לפגישה שנקבעה עבורך:
              </div>
            </td>
          </tr>

          <!-- Appointment card -->
          <tr>
            <td style="padding:16px 32px 8px;" dir="rtl">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                     style="background:#F0FDF9;border:1px solid #99F6E4;border-radius:12px;border-right:4px solid #0D9488;">
                <tr>
                  <td style="padding:18px 20px;" dir="rtl">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td dir="rtl" style="padding-bottom:10px;">
                          <span style="font-size:11px;font-weight:700;color:#0F766E;letter-spacing:0.08em;">תאריך</span><br>
                          <span style="font-size:19px;font-weight:700;color:#0F172A;">${escapeHtml(dateLabel)}</span>
                          <span style="font-size:13px;color:#475569;">&nbsp;·&nbsp;${escapeHtml(dayLabel)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td dir="rtl">
                          <span style="font-size:11px;font-weight:700;color:#0F766E;letter-spacing:0.08em;">שעה</span><br>
                          <span style="font-size:19px;font-weight:700;color:#0F172A;">${escapeHtml(timeLabel)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Closing -->
          <tr>
            <td style="padding:14px 32px 26px;" dir="rtl">
              <div style="font-size:14px;color:#475569;line-height:1.7;">
                נשמח לראותך! אם אינך יכולה להגיע — נשמח לעדכון מראש.
              </div>
              <div style="font-size:14px;color:#0F172A;font-weight:600;margin-top:14px;">
                בברכה,<br>צוות מחר אחר – שדה חמד
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#FAFBFD;border-top:1px solid #E8ECF0;" dir="rtl">
              <div style="font-size:11px;color:#94A3B8;line-height:1.55;">
                הודעה זו נשלחה ממערכת מחר אחר – שדה חמד.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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

  const dateLabel = ddmmyyyy(session.date);
  const timeLabel = hm(session.start_time);
  const message =
    `שלום ${patient.full_name}, תזכורת לפגישה שנקבעה לתאריך ${dateLabel} בשעה ${timeLabel}.`;

  const html = renderReminderEmail({
    patientName: patient.full_name,
    dateLabel,
    dayLabel: hebrewDayName(session.date),
    timeLabel,
  });

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
