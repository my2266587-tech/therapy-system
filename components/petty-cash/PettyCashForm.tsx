'use client';

import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Field, TextareaField } from '@/components/ui/FormField';
import type { PettyCash } from '@/types';

interface Props { initial: PettyCash | null; onSave: () => void; onCancel: () => void; }

export default function PettyCashForm({ initial, onSave, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date:    initial?.date    ?? today,
    amount:  String(initial?.amount ?? ''),
    purpose: initial?.purpose ?? '',
    notes:   initial?.notes   ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) { setError('יש להגדיר חיבור Supabase לפני שמירת נתונים'); return; }
    if (!form.purpose) { setError('יש למלא עבור מה ההוצאה'); return; }
    setSaving(true); setError('');
    const payload = { date: form.date, amount: Number(form.amount), purpose: form.purpose, notes: form.notes, patient_id: null };
    const { error: err } = initial?.id
      ? await supabase.from('petty_cash').update(payload).eq('id', initial.id)
      : await supabase.from('petty_cash').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="תאריך *" type="date" value={form.date} onChange={v => set('date', v)} required />
        <Field label="סכום (₪) *" type="number" value={form.amount} onChange={v => set('amount', v)} required placeholder="0.00" />
        <Field label="עבור מה *" value={form.purpose} onChange={v => set('purpose', v)} required placeholder="תיאור ההוצאה..." />
      </div>
      <TextareaField label="הערות" value={form.notes} onChange={v => set('notes', v)} rows={2} placeholder="הערות נוספות..." />
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving} className="px-6 py-2.5 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-sm">
          {saving ? 'שומר...' : initial?.id ? 'עדכן הוצאה' : 'שמור הוצאה'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
