'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import type { PrivateExpense } from '@/types';
type PatientOpt = { id: string; full_name: string };

const TREATMENT_OPTIONS = [
  { value: 'אומנות', label: 'אומנות' },
  { value: 'תרפיה',  label: 'תרפיה' },
  { value: 'פיסול',  label: 'פיסול' },
  { value: 'מוזיקה', label: 'מוזיקה' },
  { value: 'תנועה',  label: 'תנועה' },
  { value: 'אחר',    label: 'אחר' },
];

interface Props { initial: PrivateExpense | null; onSave: () => void; onCancel: () => void; }

export default function ExpenseForm({ initial, onSave, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    patient_id:     initial?.patient_id     ?? '',
    date:           initial?.date           ?? today,
    treatment_type: initial?.treatment_type ?? '',
    materials:      initial?.materials      ?? '',
    details:        initial?.details        ?? '',
    cost:           String(initial?.cost    ?? ''),
    notes:          initial?.notes          ?? '',
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
    if (!form.patient_id)     { setError('יש לבחור מטופלת'); return; }
    if (!form.treatment_type) { setError('יש לבחור סוג טיפול'); return; }
    setSaving(true); setError('');
    const payload = { ...form, cost: Number(form.cost) };
    const { error: err } = initial?.id
      ? await supabase.from('private_expenses').update(payload).eq('id', initial.id)
      : await supabase.from('private_expenses').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="מטופלת *" value={form.patient_id} onChange={v => set('patient_id', v)} options={patientOptions} placeholder="בחרי מטופלת..." required />
        <Field label="תאריך *" type="date" value={form.date} onChange={v => set('date', v)} required />
        <SelectField label="סוג טיפול *" value={form.treatment_type} onChange={v => set('treatment_type', v)} options={TREATMENT_OPTIONS} placeholder="בחרי..." required />
        <Field label="עלות (₪) *" type="number" value={form.cost} onChange={v => set('cost', v)} required />
        <Field label="חומרים" value={form.materials} onChange={v => set('materials', v)} />
      </div>
      <TextareaField label="פירוט" value={form.details} onChange={v => set('details', v)} rows={2} />
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
