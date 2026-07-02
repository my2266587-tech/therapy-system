'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, SelectField, ComboField } from '@/components/ui/FormField';
import DictatedTextarea from '@/components/ui/DictatedTextarea';
import type { Task } from '@/types';

type PatientOpt = { id: string; full_name: string };

const PRIORITY_OPTIONS = [
  { value: 'high',   label: 'גבוהה' },
  { value: 'medium', label: 'בינונית' },
  { value: 'low',    label: 'נמוכה' },
];

interface Props {
  initial: Task | null;
  /** Pre-fill the category when adding a new task from a specific group card. */
  defaultCategory?: string;
  /** Existing category names, for the autocomplete list. */
  categories: string[];
  onSave: () => void;
  onCancel: () => void;
}

export default function TaskForm({ initial, defaultCategory, categories, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    title:       initial?.title       ?? '',
    description: initial?.description  ?? '',
    category:    initial?.category    ?? defaultCategory ?? '',
    priority:    initial?.priority    ?? 'medium',
    due_date:    initial?.due_date     ?? '',
    assignee:    initial?.assignee    ?? '',
    patient_id:  initial?.patient_id   ?? '',
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
    if (!form.title.trim()) { setError('יש להזין כותרת למשימה'); return; }
    setSaving(true); setError('');
    const payload = {
      title:       form.title.trim(),
      description: form.description.trim() || null,
      category:    form.category.trim() || null,
      priority:    form.priority,
      due_date:    form.due_date || null,
      assignee:    form.assignee.trim() || null,
      patient_id:  form.patient_id || null,
    };
    const { error: err } = initial?.id
      ? await supabase.from('tasks').update(payload).eq('id', initial.id)
      : await supabase.from('tasks').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <DictatedTextarea label="כותרת * (אפשר להכתיב 🎙)" value={form.title} onChange={v => set('title', v)} rows={1} placeholder="מה צריך לעשות? — הקלידי או לחצי על המיקרופון" />
      <DictatedTextarea label="פירוט (אפשר להכתיב 🎙)" value={form.description} onChange={v => set('description', v)} rows={3} placeholder="כל מה שצריך לדעת על המשימה — הקלידי או הכתיבי בקול..." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ComboField label="קטגוריה" value={form.category} onChange={v => set('category', v)} suggestions={categories} placeholder="בחרי קיימת או הקלידי חדשה" />
        <SelectField label="עדיפות" value={form.priority} onChange={v => set('priority', v)} options={PRIORITY_OPTIONS} />
        <Field label="תאריך יעד" type="date" value={form.due_date} onChange={v => set('due_date', v)} />
        <Field label="אחראי/ת" value={form.assignee} onChange={v => set('assignee', v)} placeholder="מי מטפל/ת במשימה" />
      </div>
      <SelectField label="מטופלת קשורה" value={form.patient_id} onChange={v => set('patient_id', v)} options={patientOptions} placeholder="ללא — משימה כללית" />
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף משימה'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
