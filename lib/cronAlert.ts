import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

/**
 * Wraps a cron route handler so that a failure (a thrown error or any 5xx
 * response) emails the admin. Scheduled jobs run unattended — without this, a
 * monthly report or the day-before reminders could stop working and nobody
 * would know.
 *
 *   async function handle(req: NextRequest) { ... }
 *   export const POST = withFailureAlert('הדוח החודשי', handle);
 *
 * 401s (bad / missing CRON_SECRET) are not alerted — those are probes, not
 * job failures. The alert goes through Resend (REPORT_EMAIL_TO), a different
 * channel from the Gmail SMTP the reminders use, so a Gmail outage is still
 * reported. If the alert itself can't be sent, it is only logged.
 */
export function withFailureAlert(
  job: string,
  handler: (req: NextRequest) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    let res: NextResponse;
    try {
      res = await handler(req);
    } catch (err) {
      await sendFailureAlert(job, (err as Error)?.message ?? String(err));
      throw err;
    }
    if (res.status >= 500) {
      const body = await res.clone().json().catch(() => null) as { error?: string } | null;
      await sendFailureAlert(job, body?.error ?? `HTTP ${res.status}`);
    }
    return res;
  };
}

async function sendFailureAlert(job: string, reason: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.REPORT_EMAIL_TO;
  const from   = process.env.REPORT_EMAIL_FROM || 'system@maharchacher.co.il';
  console.error(`[cron-alert] "${job}" failed:`, reason);
  if (!apiKey || !to) {
    console.error('[cron-alert] not sent — RESEND_API_KEY / REPORT_EMAIL_TO missing');
    return;
  }

  const when = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date());

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: to.split(',').map(s => s.trim()).filter(Boolean),
      subject: `⚠️ משימה אוטומטית נכשלה: ${job}`,
      text: `המשימה "${job}" נכשלה (${when}).\n\nסיבה: ${reason}\n\nאפשר להפעיל אותה שוב ידנית אחרי התיקון.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#0F172A">
        <p><b>המשימה "${escapeHtml(job)}" נכשלה.</b></p>
        <p>מתי: ${escapeHtml(when)}</p>
        <p>סיבה: <code style="background:#F1F5F9;padding:2px 6px;border-radius:4px">${escapeHtml(reason)}</code></p>
        <p style="color:#64748B">אפשר להפעיל אותה שוב ידנית אחרי התיקון.</p>
      </div>`,
    });
    if (error) console.error('[cron-alert] send failed:', error.message);
  } catch (e) {
    console.error('[cron-alert] send failed:', (e as Error).message);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
