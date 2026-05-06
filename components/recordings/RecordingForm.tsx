'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { SelectField, TextareaField } from '@/components/ui/FormField';
import type { Recording } from '@/types';
type PatientOpt = { id: string; full_name: string };

const STATUS_OPTIONS = [
  { value: 'pending',     label: 'ממתין לתמלול' },
  { value: 'transcribed', label: 'תומלל' },
  { value: 'draft_ready', label: 'טיוטה מוכנה' },
  { value: 'approved',    label: 'אושר' },
];

interface Props { initial: Recording | null; onSave: () => void; onCancel: () => void; }

export default function RecordingForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    patient_id:    initial?.patient_id    ?? '',
    status:        initial?.status        ?? 'pending',
    transcript:    initial?.transcript    ?? '',
    draft_summary: initial?.draft_summary ?? '',
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
    if (!form.patient_id) { setError('יש לבחור מטופלת'); return; }
    setSaving(true); setError('');
    const { error: err } = initial?.id
      ? await supabase.from('recordings').update(form).eq('id', initial.id)
      : await supabase.from('recordings').insert(form);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <SelectField label="מטופלת *" value={form.patient_id} onChange={v => set('patient_id', v)} options={patientOptions} placeholder="בחרי מטופלת..." required />
      <SelectField label="סטטוס" value={form.status} onChange={v => set('status', v)} options={STATUS_OPTIONS} />
      <TextareaField label="תמלול" value={form.transcript} onChange={v => set('transcript', v)} rows={4} placeholder="הכנסי תמלול ידנית..." />
      <TextareaField label="טיוטת סיכום" value={form.draft_summary} onChange={v => set('draft_summary', v)} rows={4} placeholder="טיוטת סיכום..." />
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
