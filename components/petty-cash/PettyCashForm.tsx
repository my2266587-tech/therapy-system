'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, TextareaField, SelectField } from '@/components/ui/FormField';
import type { PettyCash } from '@/types';
type PatientOpt = { id: string; full_name: string };

interface Props { initial: PettyCash | null; onSave: () => void; onCancel: () => void; }

export default function PettyCashForm({ initial, onSave, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date:       initial?.date       ?? today,
    amount:     String(initial?.amount ?? ''),
    purpose:    initial?.purpose    ?? '',
    patient_id: initial?.patient_id ?? '',
    notes:      initial?.notes      ?? '',
  });
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    supabase.from('patients').select('id, full_name').order('full_name').then(({ data }) => setPatients(data ?? []));
  }, []);

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.purpose) { setError('יש למלא עבור מה ההוצאה'); return; }
    setSaving(true); setError('');
    const payload = { ...form, amount: Number(form.amount), patient_id: form.patient_id || null };
    const { error: err } = initial?.id
      ? await supabase.from('petty_cash').update(payload).eq('id', initial.id)
      : await supabase.from('petty_cash').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="תאריך *" type="date" value={form.date} onChange={v => set('date', v)} required />
        <Field label="סכום (₪) *" type="number" value={form.amount} onChange={v => set('amount', v)} required />
        <Field label="עבור *" value={form.purpose} onChange={v => set('purpose', v)} required />
        <SelectField label="מטופלת (אם רלוונטי)" value={form.patient_id} onChange={v => set('patient_id', v)} options={patientOptions} placeholder="לא מקושר..." />
      </div>
      <TextareaField label="הערות" value={form.notes} onChange={v => set('notes', v)} rows={2} />
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
