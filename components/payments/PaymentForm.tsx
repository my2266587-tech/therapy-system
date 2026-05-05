'use client';

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Field, SelectField } from '@/components/ui/FormField';
import type { Payment } from '@/types';

type StaffOpt = { id: string; full_name: string; email: string | null };

const HEBREW_MONTHS = [
  { value: '01', label: 'ינואר' },
  { value: '02', label: 'פברואר' },
  { value: '03', label: 'מרץ' },
  { value: '04', label: 'אפריל' },
  { value: '05', label: 'מאי' },
  { value: '06', label: 'יוני' },
  { value: '07', label: 'יולי' },
  { value: '08', label: 'אוגוסט' },
  { value: '09', label: 'ספטמבר' },
  { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' },
  { value: '12', label: 'דצמבר' },
];

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'העברה בנקאית' },
  { value: 'cash',          label: 'מזומן' },
  { value: 'check',         label: "צ'ק" },
  { value: 'other',         label: 'אחר' },
];

function nowYear() { return new Date().getFullYear(); }

function yearOptions() {
  const y = nowYear();
  return [y - 2, y - 1, y, y + 1].map(n => ({ value: String(n), label: String(n) }));
}

function splitMonth(yyyyMm: string) {
  const [y, m] = yyyyMm.split('-');
  return { year: y ?? String(nowYear()), month: m ?? '01' };
}

export interface SaveMsg { text: string; ok: boolean }

interface Props {
  initial: Payment | null;
  onSave: (msg?: SaveMsg) => void;
  onCancel: () => void;
}

export default function PaymentForm({ initial, onSave, onCancel }: Props) {
  const init         = splitMonth(initial?.month ?? `${nowYear()}-01`);
  const [monthNum,   setMonthNum]   = useState(init.month);
  const [year,       setYear]       = useState(init.year);
  const [amount,     setAmount]     = useState(String(initial?.amount ?? ''));
  const [isPaid,     setIsPaid]     = useState(String(initial?.is_paid ?? 'false'));
  const [method,     setMethod]     = useState(initial?.payment_method ?? '');
  const [recvDate,   setRecvDate]   = useState(initial?.received_date  ?? '');
  const [coordId,    setCoordId]    = useState(initial?.coordinator_id ?? '');
  const [staff,      setStaff]      = useState<StaffOpt[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.from('staff').select('id, full_name, email').eq('role', 'coordinator').order('full_name')
      .then(({ data }) => setStaff((data ?? []) as StaffOpt[]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) { setError('יש להגדיר חיבור Supabase לפני שמירת נתונים'); return; }
    setSaving(true); setError('');

    const payload = {
      month:          `${year}-${monthNum}`,
      amount:         Number(amount),
      is_paid:        isPaid === 'true',
      payment_method: method   || null,
      received_date:  recvDate || null,
      coordinator_id: coordId  || null,
    };

    let paymentId = initial?.id;

    if (initial?.id) {
      const { error: err } = await supabase.from('payments').update(payload).eq('id', initial.id);
      if (err) { setSaving(false); setError(err.message); return; }
    } else {
      const { data, error: err } = await supabase.from('payments').insert(payload).select('id').single();
      if (err) { setSaving(false); setError(err.message); return; }
      paymentId = data?.id;
    }

    // Auto-email: only when payment just flipped to paid and email was not yet sent
    const wasPaid        = initial?.is_paid === true;
    const justBecamePaid = isPaid === 'true' && !wasPaid;
    const emailStatus    = initial?.email_status ?? 'not_sent';
    const coordEmail     = staff.find(s => s.id === coordId)?.email ?? null;

    let msg: SaveMsg | undefined;

    if (justBecamePaid && emailStatus === 'not_sent' && paymentId) {
      if (!coordEmail) {
        msg = { text: 'התשלום נשמר, אך לא נמצא מייל לרכזת', ok: false };
      } else {
        try {
          const res  = await fetch('/api/payments/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_id: paymentId }),
          });
          const json = await res.json();
          if (!res.ok) {
            msg = { text: json.error ?? 'שגיאה בשליחת מייל', ok: false };
          } else if (json.mock) {
            msg = { text: 'מצב בדיקה בלבד — המייל לא נשלח בפועל', ok: false };
          } else {
            msg = { text: 'התשלום סומן כשולם והמייל נשלח לרכזת', ok: true };
          }
        } catch {
          msg = { text: 'שגיאה בשליחת מייל', ok: false };
        }
      }
    }

    setSaving(false);
    onSave(msg);
  }

  const staffOptions = staff.map(s => ({ value: s.id, label: s.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="חודש *" value={monthNum} onChange={setMonthNum} options={HEBREW_MONTHS} required />
        <SelectField label="שנה *"  value={year}     onChange={setYear}     options={yearOptions()}   required />
        <Field label="סכום *" type="number" value={amount} onChange={setAmount} required />
        <SelectField label="האם שולם" value={isPaid} onChange={setIsPaid}
          options={[{ value: 'false', label: 'לא שולם' }, { value: 'true', label: 'שולם' }]} />
        <SelectField label="אופן תשלום" value={method} onChange={setMethod} options={METHOD_OPTIONS} placeholder="בחרי..." />
        <Field label="תאריך קבלה" type="date" value={recvDate} onChange={setRecvDate} />
        <SelectField label="רכזת מקושרת" value={coordId} onChange={setCoordId} options={staffOptions} placeholder="בחרי רכזת..." />
      </div>
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving}
          className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors flex items-center gap-2">
          {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          ביטול
        </button>
      </div>
    </form>
  );
}
