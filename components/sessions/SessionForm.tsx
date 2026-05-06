'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import type { Session } from '@/types';
type PatientOpt = { id: string; full_name: string };

const STATUS_OPTIONS = [
  { value: 'planned',   label: 'מתוכננת' },
  { value: 'completed', label: 'התקיימה' },
  { value: 'cancelled', label: 'בוטלה' },
  { value: 'no_show',   label: 'לא הגיעה' },
];

function calcDuration(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

interface Props { initial: Session | null; onSave: () => void; onCancel: () => void; }

export default function SessionForm({ initial, onSave, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    patient_id:  initial?.patient_id  ?? '',
    date:        initial?.date        ?? today,
    start_time:  initial?.start_time  ?? '',
    end_time:    initial?.end_time    ?? '',
    status:      initial?.status      ?? 'planned',
    notes:       initial?.notes       ?? '',
  });
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    supabase.from('patients').select('id, full_name').eq('status', 'active').order('full_name')
      .then(({ data }) => setPatients(data ?? []));
  }, []);

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_id) { setError('יש לבחור מטופלת'); return; }
    if (!form.start_time || !form.end_time) { setError('יש להזין שעות'); return; }
    setSaving(true); setError('');

    const payload = { ...form, duration_minutes: calcDuration(form.start_time, form.end_time) };

    const { error: err } = initial?.id
      ? await supabase.from('sessions').update(payload).eq('id', initial.id)
      : await supabase.from('sessions').insert(payload);
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
        <Field label="שעת התחלה *" type="time" value={form.start_time} onChange={v => set('start_time', v)} required />
        <Field label="שעת סיום *" type="time" value={form.end_time} onChange={v => set('end_time', v)} required />
        <SelectField label="סטטוס" value={form.status} onChange={v => set('status', v)} options={STATUS_OPTIONS} />
        {form.start_time && form.end_time && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">משך מחושב</span>
            <span className="text-sm text-teal-700 font-medium pt-2">
              {calcDuration(form.start_time, form.end_time) ?? '-'} דקות
            </span>
          </div>
        )}
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
