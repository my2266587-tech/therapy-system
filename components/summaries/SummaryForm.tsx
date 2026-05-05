'use client';

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import FormGroup from '@/components/ui/FormGroup';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import { fmtDate } from '@/lib/dateUtils';
import type { SessionSummary } from '@/types';
type PatientOpt = { id: string; full_name: string };
type SessionOpt = { id: string; date: string; start_time: string; end_time: string; duration_minutes: number | null };

function calcDuration(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const d = (eh * 60 + em) - (sh * 60 + sm);
  return d > 0 ? d : null;
}

interface Props {
  initial: SessionSummary | null;
  onSave: () => void;
  onCancel: () => void;
  fixedPatient?: { id: string; name: string };
  recordingId?: string | null;
}

export default function SummaryForm({ initial, onSave, onCancel, fixedPatient, recordingId }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    patient_id:        fixedPatient?.id ?? initial?.patient_id        ?? '',
    session_id:        initial?.session_id        ?? '',
    date:              initial?.date              ?? today,
    start_time:        initial?.start_time        ?? '',
    end_time:          initial?.end_time          ?? '',
    current_state:     initial?.current_state     ?? '',
    main_topics:       initial?.main_topics       ?? '',
    treatment_actions: initial?.treatment_actions ?? '',
    next_steps:        initial?.next_steps        ?? '',
    tasks_given:       initial?.tasks_given       ?? '',
    progress:          initial?.progress          ?? '',
    difficulties:      initial?.difficulties      ?? '',
    notes:             initial?.notes             ?? '',
  });
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [sessions, setSessions] = useState<SessionOpt[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured || fixedPatient) return;
    supabase.from('patients').select('id, full_name').order('full_name').then(({ data }) => setPatients(data ?? []));
  }, [fixedPatient]);

  useEffect(() => {
    if (!isSupabaseConfigured || !form.patient_id) { setSessions([]); return; }
    supabase.from('sessions').select('id, date, start_time, end_time, duration_minutes').eq('patient_id', form.patient_id).order('date', { ascending: false })
      .then(({ data }) => setSessions(data ?? []));
  }, [form.patient_id]);

  useEffect(() => {
    if (!form.session_id || sessions.length === 0) return;
    const s = sessions.find(s => s.id === form.session_id);
    if (!s) return;
    setForm(p => ({ ...p, date: s.date, start_time: s.start_time, end_time: s.end_time }));
  }, [form.session_id, sessions]);

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) { setError('יש להגדיר חיבור Supabase לפני שמירת נתונים'); return; }
    if (!form.patient_id) { setError('יש לבחור מטופלת'); return; }
    setSaving(true); setError('');
    const payload = {
      ...form,
      session_id:       form.session_id || null,
      duration_minutes: calcDuration(form.start_time, form.end_time),
      recording_id:     recordingId ?? null,
    };
    const { error: err } = initial?.id
      ? await supabase.from('session_summaries').update(payload).eq('id', initial.id)
      : await supabase.from('session_summaries').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    // Mark linked session as completed
    if (form.session_id) {
      await supabase.from('sessions').update({ status: 'completed' }).eq('id', form.session_id);
    }
    onSave();
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));
  const sessionOptions = sessions.map(s => ({ value: s.id, label: `${s.date} ${s.start_time}` }));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <FormGroup title="פרטי הפגישה">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fixedPatient ? (
            <div>
              <div className="text-xs font-medium text-slate-600 mb-1.5">מטופלת</div>
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium">
                {fixedPatient.name}
              </div>
            </div>
          ) : (
            <SelectField label="מטופלת *" value={form.patient_id} onChange={v => set('patient_id', v)} options={patientOptions} placeholder="בחרי מטופלת..." required />
          )}
          <SelectField label="פגישה מקושרת" value={form.session_id} onChange={v => set('session_id', v)} options={sessionOptions} placeholder="בחרי פגישה..." />
          {form.session_id ? (
            <div className="sm:col-span-2 bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 flex flex-wrap gap-6">
              <div><div className="text-xs text-slate-400 mb-0.5">תאריך</div>{fmtDate(form.date)}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">משעה</div>{form.start_time || '-'}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">עד שעה</div>{form.end_time || '-'}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">משך</div>{calcDuration(form.start_time, form.end_time) ?? '-'} דק'</div>
            </div>
          ) : (
            <>
              <Field label="תאריך *" type="date" value={form.date} onChange={v => set('date', v)} required />
              <div className="grid grid-cols-2 gap-2">
                <Field label="משעה" type="time" value={form.start_time} onChange={v => set('start_time', v)} />
                <Field label="עד שעה" type="time" value={form.end_time} onChange={v => set('end_time', v)} />
              </div>
            </>
          )}
        </div>
      </FormGroup>

      <FormGroup title="תוכן הפגישה">
        <div className="space-y-3">
          <TextareaField label="מצב נוכחי" value={form.current_state} onChange={v => set('current_state', v)} rows={2} />
          <TextareaField label="נושאים חשובים שעלו" value={form.main_topics} onChange={v => set('main_topics', v)} rows={2} />
          <TextareaField label="מה עשינו בטיפול" value={form.treatment_actions} onChange={v => set('treatment_actions', v)} rows={2} />
          <TextareaField label="עם מה מתחילים בפגישה הבאה" value={form.next_steps} onChange={v => set('next_steps', v)} rows={2} />
        </div>
      </FormGroup>

      <FormGroup title="מעקב ומשימות">
        <div className="space-y-3">
          <TextareaField label="משימות שקיבלה" value={form.tasks_given} onChange={v => set('tasks_given', v)} rows={2} />
          <TextareaField label="התקדמות" value={form.progress} onChange={v => set('progress', v)} rows={2} />
          <TextareaField label="קושי בהתקדמות" value={form.difficulties} onChange={v => set('difficulties', v)} rows={2} />
          <TextareaField label="הערות נוספות" value={form.notes} onChange={v => set('notes', v)} rows={2} />
        </div>
      </FormGroup>

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving} className="px-6 py-2.5 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-sm">
          {saving ? 'שומר...' : initial?.id ? 'עדכן סיכום' : 'שמור סיכום'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
