import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/api-auth';

const paymentMethodHebrew: Record<string, string> = {
  bank_transfer: 'העברה בנקאית',
  cash:          'מזומן',
  check:         "צ'ק",
  other:         'אחר',
};

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const { payment_id } = await req.json();
  if (!payment_id) {
    return NextResponse.json({ error: 'payment_id is required' }, { status: 400 });
  }

  const db = createServerClient();

  const { data: payment, error } = await db
    .from('payments')
    .select('*, coordinator:coordinator_id(full_name, email)')
    .eq('id', payment_id)
    .single();

  if (error || !payment) {
    return NextResponse.json({ error: 'תשלום לא נמצא' }, { status: 404 });
  }

  if (!payment.is_paid) {
    return NextResponse.json({ error: 'התשלום טרם סומן כשולם' }, { status: 422 });
  }

  const coordinator = payment.coordinator as { full_name: string; email: string | null } | null;
  const toEmail = coordinator?.email ?? null;

  if (!toEmail) {
    return NextResponse.json({ error: 'לרכזת אין כתובת מייל מוגדרת' }, { status: 422 });
  }

  const month          = payment.month ?? '';
  const amount         = Number(payment.amount).toLocaleString('he-IL');
  const methodLabel    = payment.payment_method ? (paymentMethodHebrew[payment.payment_method] ?? payment.payment_method) : '';
  const receivedDate   = payment.received_date ?? '';
  const coordinatorName = coordinator?.full_name ?? '';

  const subject = `התקבל תשלום משיראל — ${month}`;
  const html = `
<div dir="rtl" style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b;">
  <h2 style="color: #0f766e;">✅ התקבל תשלום משיראל</h2>
  <p>שלום ${coordinatorName},</p>
  <p>נרשם תשלום חדש במערכת מחר אחר:</p>
  <table style="border-collapse: collapse; margin: 12px 0;">
    <tr><td style="padding: 4px 16px 4px 0; color: #64748b;">חודש:</td><td style="font-weight: bold;">${month}</td></tr>
    <tr><td style="padding: 4px 16px 4px 0; color: #64748b;">סכום:</td><td style="font-weight: bold;">₪${amount}</td></tr>
    ${methodLabel ? `<tr><td style="padding: 4px 16px 4px 0; color: #64748b;">אופן תשלום:</td><td>${methodLabel}</td></tr>` : ''}
    ${receivedDate ? `<tr><td style="padding: 4px 16px 4px 0; color: #64748b;">תאריך קבלה:</td><td>${receivedDate}</td></tr>` : ''}
  </table>
  <p style="color: #64748b; font-size: 12px; margin-top: 24px;">— מערכת מחר אחר</p>
</div>
`;

  const isMock = !process.env.RESEND_API_KEY;

  if (!isMock) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    'onboarding@resend.dev',
        to:      [toEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      await db.from('payments').update({ email_status: 'failed' }).eq('id', payment_id);
      return NextResponse.json({ error: `שגיאה בשליחת מייל: ${body}` }, { status: 500 });
    }
  } else {
    // Mock mode — log only, do NOT update email_status so it stays 'not_sent'
    console.log(`[mock email] To: ${toEmail} | Subject: ${subject}`);
    return NextResponse.json({ ok: true, mock: true, to: toEmail });
  }

  await db.from('payments').update({ email_status: 'sent' }).eq('id', payment_id);

  return NextResponse.json({ ok: true, mock: false, to: toEmail });
}
