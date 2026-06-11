'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import type { Payment } from '@/types';
type StaffOpt = { id: string; full_name: string };

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'העברה בנקאית' },
  { value: 'cash',          label: 'מזומן' },
  { value: 'check',         label: "צ'ק" },
  { value: 'other',         label: 'אחר' },
];

const EMAIL_OPTIONS = [
  { value: 'not_sent', label: 'לא נשלח' },
  { value: 'sent',     label: 'נשלח' },
  { value: 'failed',   label: 'שגיאה' },
];

interface Props { initial: Payment | null; onSave: () => void; onCancel: () => void; }

export default function PaymentForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    month:          initial?.month          ?? '',
    amount:         String(initial?.amount  ?? ''),
    is_paid:        String(initial?.is_paid ?? 'false'),
    payment_method: initial?.payment_method ?? '',
    received_date:  initial?.received_date  ?? '',
    coordinator_id: initial?.coordinator_id ?? '',
    email_status:   initial?.email_status   ?? 'not_sent',
    notes:          initial?.notes          ?? '',
  });
  const [staff,   setStaff]   = useState<StaffOpt[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    supabase.from('staff').select('id, full_name').eq('role', 'coordinator').order('full_name')
      .then(({ data }) => setStaff(data ?? []));
  }, []);

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.month) { setError('יש להזין חודש'); return; }
    setSaving(true); setError('');
    const payload = {
      ...form,
      amount:         Number(form.amount),
      is_paid:        form.is_paid === 'true',
      payment_method: form.payment_method || null,
      received_date:  form.received_date  || null,
      coordinator_id: form.coordinator_id || null,
      notes:          form.notes.trim()   || null,
    };
    const { error: err } = initial?.id
      ? await supabase.from('payments').update(payload).eq('id', initial.id)
      : await supabase.from('payments').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  const staffOptions = staff.map(s => ({ value: s.id, label: s.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="חודש (YYYY-MM) *" value={form.month} onChange={v => set('month', v)} placeholder="2025-01" required />
        <Field label="סכום *" type="number" value={form.amount} onChange={v => set('amount', v)} required />
        <SelectField label="האם שולם" value={form.is_paid} onChange={v => set('is_paid', v)} options={[{ value: 'false', label: 'לא שולם' }, { value: 'true', label: 'שולם' }]} />
        <SelectField label="אופן תשלום" value={form.payment_method} onChange={v => set('payment_method', v)} options={METHOD_OPTIONS} placeholder="בחרי..." />
        <Field label="תאריך קבלה" type="date" value={form.received_date} onChange={v => set('received_date', v)} />
        <SelectField label="רכזת מקושרת" value={form.coordinator_id} onChange={v => set('coordinator_id', v)} options={staffOptions} placeholder="בחרי רכזת..." />
        <SelectField label="סטטוס מייל" value={form.email_status} onChange={v => set('email_status', v)} options={EMAIL_OPTIONS} />
      </div>
      <TextareaField label="הערות" value={form.notes} onChange={v => set('notes', v)} rows={3} placeholder="הערות חופשיות..." />
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
