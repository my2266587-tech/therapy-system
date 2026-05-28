/**
 * POST /api/reminders/sessions-tomorrow
 *
 *   Day-before email reminder. Fetches every PLANNED session whose date
 *   is "tomorrow in Israel" and sends a single RTL-styled HTML email
 *   listing them, ordered by start_time.
 *
 *   The "tomorrow in Israel" math is done in code (not in SQL) so that
 *   wherever the cron runs and whatever the Vercel function's wall clock
 *   says, "tomorrow" always means the next calendar day in Asia/Jerusalem.
 *
 *   Transport: Gmail SMTP via Nodemailer (not Resend).
 *
 *   Reason: Resend blocks sending to any address other than the account
 *   owner until a domain is verified. The clinic doesn't own a domain,
 *   so we relay through a personal Gmail account using an App Password
 *   — Google lets you send from any Gmail you own to any recipient with
 *   no extra verification beyond enabling 2-Step Verification + creating
 *   the App Password.
 *
 * Auth:
 *   - Bearer ${CRON_SECRET}. Vercel Cron sets this; manual triggers also OK.
 *
 * Required env vars:
 *   - CRON_SECRET
 *   - GMAIL_USER          — gmail address sending the mail (e.g. s0548539967@gmail.com)
 *   - GMAIL_APP_PASSWORD  — 16-char App Password from Google Account → Security
 *   - REMINDER_EMAIL_TO   — recipient (s0548539967@gmail.com)
 *
 * Optional:
 *   - REMINDER_EMAIL_FROM_NAME — display name in the From header (default: "מערכת מחר אחר")
 *
 * Behavior:
 *   - 0 sessions tomorrow → returns { ok, sessions: 0 } and does NOT send
 *     a "nothing to remind" email. The clinic doesn't need empty pings.
 *   - 1+ sessions → one email, one list, recipient in env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServerClient } from '@/lib/supabaseServer';

export const maxDuration = 30;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * "Tomorrow" in Israel as a YYYY-MM-DD string.
 *
 * Uses Intl to get today-in-Israel reliably regardless of the server's
 * timezone, then adds one calendar day via UTC math (which is DST-safe
 * because we already collapsed to a date with no time component).
 */
function tomorrowInIsrael(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const pick = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const y = Number(pick('year'));
  const m = Number(pick('month'));
  const d = Number(pick('day'));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

const HEB_WEEKDAY: Record<number, string> = {
  0: 'יום ראשון', 1: 'יום שני', 2: 'יום שלישי', 3: 'יום רביעי',
  4: 'יום חמישי', 5: 'יום שישי', 6: 'שבת',
};
const HEB_MONTHS: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ',     4: 'אפריל',
  5: 'מאי',   6: 'יוני',   7: 'יולי',     8: 'אוגוסט',
  9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
};

function formatHebrewLongFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  // Use UTC so we don't get bitten by local-TZ off-by-one on day.
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = HEB_WEEKDAY[dt.getUTCDay()] ?? '';
  return `${weekday}, ${d} ב${HEB_MONTHS[m]} ${y}`;
}

type SessionRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  patient: { full_name: string } | null;
};

function trimSecondsToHMM(t: string | null): string {
  if (!t) return '';
  const m = t.match(/^(\d{1,2}:\d{2})/);
  return m?.[1] ?? t;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Render the reminder email body. Inline CSS only — every popular email
 * client (Gmail, Outlook web/desktop, Apple Mail, mobile) ignores
 * <style> blocks in <head>, so anything that needs to actually render
 * has to live on the element itself.
 */
function renderEmail(opts: {
  sessions: SessionRow[];
  tomorrowYmd: string;
  siteUrl?: string;
}): string {
  const { sessions, tomorrowYmd, siteUrl } = opts;
  const heading = `תזכורת — פגישות מחר`;
  const subtitle = formatHebrewLongFromYmd(tomorrowYmd);

  const cards = sessions.map(s => {
    const start = trimSecondsToHMM(s.start_time);
    const end   = trimSecondsToHMM(s.end_time);
    const name  = s.patient?.full_name ?? '—';
    const notes = (s.notes ?? '').trim();
    return `
      <tr>
        <td style="padding:0 0 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background:#FFFFFF;border:1px solid #E8ECF0;border-radius:12px;border-right:4px solid #0D9488;">
            <tr>
              <td style="padding:14px 18px;" dir="rtl">
                <div style="display:flex;align-items:baseline;justify-content:space-between;font-family:Arial,Helvetica,sans-serif;">
                  <div>
                    <div style="font-size:13px;color:#94A3B8;font-weight:600;letter-spacing:0.04em;margin-bottom:3px;">
                      ${escapeHtml(start)}${end ? ` – ${escapeHtml(end)}` : ''}
                    </div>
                    <div style="font-size:17px;font-weight:700;color:#0F172A;line-height:1.3;">
                      ${escapeHtml(name)}
                    </div>
                    ${notes ? `
                    <div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.55;">
                      ${escapeHtml(notes)}
                    </div>` : ''}
                  </div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join('');

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#F6F8FB;direction:rtl;font-family:Arial,Helvetica,'Heebo','Open Sans Hebrew',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F6F8FB;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
               style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 14px rgba(15,23,42,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0D9488 0%,#0F766E 100%);padding:28px 32px;" dir="rtl">
              <div style="font-size:12px;color:rgba(255,255,255,0.78);font-weight:600;letter-spacing:0.10em;text-transform:uppercase;margin-bottom:6px;">
                מערכת מחר אחר
              </div>
              <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:700;letter-spacing:-0.01em;">
                ${escapeHtml(heading)}
              </h1>
              <div style="margin-top:8px;color:rgba(255,255,255,0.92);font-size:14px;font-weight:500;">
                ${escapeHtml(subtitle)}
              </div>
            </td>
          </tr>

          <!-- Summary line -->
          <tr>
            <td style="padding:18px 32px 4px;" dir="rtl">
              <div style="font-size:13px;color:#475569;">
                ${sessions.length === 1
                  ? 'יש פגישה אחת מתוכננת מחר:'
                  : `יש ${sessions.length} פגישות מתוכננות מחר:`}
              </div>
            </td>
          </tr>

          <!-- Session cards -->
          <tr>
            <td style="padding:14px 32px 8px;" dir="rtl">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${cards}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          ${siteUrl ? `
          <tr>
            <td style="padding:8px 32px 24px;" dir="rtl" align="right">
              <a href="${escapeHtml(siteUrl)}/calendar" style="
                display:inline-block;padding:10px 22px;border-radius:10px;
                background:#F0FDF9;color:#0D9488;font-weight:600;font-size:13px;
                text-decoration:none;border:1px solid #99F6E4;">
                פתח את הלוח שנה ←
              </a>
            </td>
          </tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px;background:#FAFBFD;border-top:1px solid #E8ECF0;" dir="rtl">
              <div style="font-size:11px;color:#94A3B8;line-height:1.55;">
                תזכורת אוטומטית. נשלחת בכל ערב על פגישות יום למחרת.<br>
                כדי לשנות את כתובת היעד — לערוך את
                <code style="background:#F1F5F9;padding:1px 5px;border-radius:4px;">REMINDER_EMAIL_TO</code>
                ב-Vercel.
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
  try {
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'CRON_SECRET לא מוגדר בסביבה.' },
        { status: 500 },
      );
    }
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const gmailUser     = process.env.GMAIL_USER;
    const gmailPassword = process.env.GMAIL_APP_PASSWORD;
    const emailTo       = process.env.REMINDER_EMAIL_TO;
    const fromName      = process.env.REMINDER_EMAIL_FROM_NAME ?? 'מערכת מחר אחר';

    const missing: string[] = [];
    if (!gmailUser)     missing.push('GMAIL_USER');
    if (!gmailPassword) missing.push('GMAIL_APP_PASSWORD');
    if (!emailTo)       missing.push('REMINDER_EMAIL_TO');
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `הגדרות מייל חסרות: ${missing.join(', ')}. הוסיפי אותן ב-Vercel project env ונסי שוב.`,
          missing,
        },
        { status: 500 },
      );
    }

    // Allow ?date=YYYY-MM-DD for manual testing of a specific date.
    const override = req.nextUrl.searchParams.get('date');
    const tomorrowYmd = override && /^\d{4}-\d{2}-\d{2}$/.test(override)
      ? override
      : tomorrowInIsrael();

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('sessions')
      .select('id, date, start_time, end_time, status, notes, patient:patient_id(full_name)')
      .eq('date', tomorrowYmd)
      .eq('status', 'planned')
      .order('start_time', { ascending: true, nullsFirst: false });
    if (error) throw new Error(`sessions fetch: ${error.message}`);

    const sessions = (data ?? []) as unknown as SessionRow[];

    if (sessions.length === 0) {
      // Skip the email — no point sending "you have no sessions" every day.
      return NextResponse.json({
        ok: true,
        recipient: emailTo!,
        date: tomorrowYmd,
        sessions: 0,
        sent: false,
        reason: 'no sessions tomorrow',
      });
    }

    const html = renderEmail({
      sessions,
      tomorrowYmd,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    });

    const subject = sessions.length === 1
      ? `תזכורת: פגישה מחר`
      : `תזכורת: ${sessions.length} פגישות מחר`;

    // Gmail SMTP via Nodemailer. host/port/secure are fixed — the only
    // thing the caller controls is the credentials. App Password is a
    // 16-char per-app token from Google Account → Security → 2-Step
    // Verification → App Passwords (requires 2FA enabled).
    const transporter = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   465,
      secure: true,
      auth: {
        user: gmailUser!,
        // Google ignores spaces in the displayed 16-char password, but
        // Nodemailer doesn't. Strip them for the user's convenience.
        pass: gmailPassword!.replace(/\s+/g, ''),
      },
    });

    try {
      await transporter.sendMail({
        from:    `"${fromName}" <${gmailUser!}>`,
        to:      emailTo!,
        subject,
        html,
      });
    } catch (e) {
      // Common cases — surface a Hebrew nudge so the user knows what to
      // fix instead of just "Invalid login".
      const msg = (e as Error).message;
      if (/Invalid login|Username and Password not accepted/i.test(msg)) {
        throw new Error(
          'Gmail דחה את הזיהוי. ודאי ש-GMAIL_APP_PASSWORD הוא App Password ' +
          'אמיתי (16 תווים, מ-Google Account → Security → App Passwords) ' +
          'ושתכונת 2-Step Verification מופעלת בחשבון.',
        );
      }
      throw new Error(`Gmail SMTP send failed: ${msg}`);
    }

    return NextResponse.json({
      ok: true,
      recipient: emailTo!,
      from: gmailUser!,
      date: tomorrowYmd,
      sessions: sessions.length,
      sent: true,
    });

  } catch (err) {
    console.error('[reminders-tomorrow]', {
      message: (err as Error)?.message,
      stack:   (err as Error)?.stack,
    });
    return NextResponse.json(
      { error: (err as Error)?.message ?? String(err) },
      { status: 500 },
    );
  }
}

/** Manual browser trigger — same handler, same auth. */
export async function GET(req: NextRequest) {
  return POST(req);
}
