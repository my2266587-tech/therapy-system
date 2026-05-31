'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import FormGroup from '@/components/ui/FormGroup';
import { Field, SelectField } from '@/components/ui/FormField';
import DictatedTextarea from '@/components/ui/DictatedTextarea';
import type { SessionSummary } from '@/types';
type PatientOpt = { id: string; full_name: string };
type SessionOpt = { id: string; date: string; start_time: string };

function calcDuration(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const d = (eh * 60 + em) - (sh * 60 + sm);
  return d > 0 ? d : null;
}

interface Props { initial: SessionSummary | null; onSave: () => void; onCancel: () => void; }

export default function SummaryForm({ initial, onSave, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    patient_id:        initial?.patient_id         ?? '',
    session_id:        initial?.session_id         ?? '',
    date:              initial?.date               ?? today,
    start_time:        initial?.start_time         ?? '',
    end_time:          initial?.end_time           ?? '',
    current_state:     initial?.current_state      ?? '',
    main_topics:       initial?.main_topics        ?? '',
    treatment_actions: initial?.treatment_actions  ?? '',
    next_steps:        initial?.next_steps         ?? '',
    tasks_given:       initial?.tasks_given        ?? '',
    progress:          initial?.progress           ?? '',
    difficulties:      initial?.difficulties       ?? '',
    notes:             initial?.notes              ?? '',
    attachment_path:   initial?.attachment_path    ?? '',
    attachment_name:   initial?.attachment_name    ?? '',
  });
  const [patients,  setPatients]  = useState<PatientOpt[]>([]);
  const [sessions,  setSessions]  = useState<SessionOpt[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  // The original attachment_path that was loaded for this summary. If the
  // user replaces or clears the file we keep this around so we can clean up
  // the now-orphaned storage object on submit.
  const initialAttachmentPath = initial?.attachment_path ?? '';
  const [uploading, setUploading] = useState(false);
  const [attachErr, setAttachErr] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.from('patients').select('id, full_name').order('full_name').then(({ data }) => setPatients(data ?? []));
  }, []);

  useEffect(() => {
    if (!form.patient_id) { setSessions([]); return; }
    supabase.from('sessions').select('id, date, start_time').eq('patient_id', form.patient_id).order('date', { ascending: false })
      .then(({ data }) => setSessions(data ?? []));
  }, [form.patient_id]);

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function handlePickFile(file: File | null) {
    if (!file) return;
    if (!form.patient_id) {
      setAttachErr('יש לבחור מטופלת לפני העלאת קובץ');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachErr('הקובץ גדול מ-10MB');
      return;
    }
    setAttachErr('');
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) { setAttachErr('יש להתחבר מחדש'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('patient_id', form.patient_id);
      const res = await fetch('/api/summaries/upload-attachment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setAttachErr(json?.error ?? 'שגיאה בהעלאה');
        return;
      }
      // If we replaced a freshly-uploaded (not yet saved) file, drop the
      // previous storage object so we don't leak it.
      if (form.attachment_path && form.attachment_path !== initialAttachmentPath) {
        await deleteAttachment(form.attachment_path, token);
      }
      setForm(p => ({
        ...p,
        attachment_path: json.path,
        attachment_name: json.name,
      }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteAttachment(path: string, token: string) {
    try {
      await fetch('/api/summaries/delete-attachment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });
    } catch {
      // Best-effort cleanup — never block the user.
    }
  }

  async function handleClearAttachment() {
    setAttachErr('');
    const token = await getToken();
    // Only nuke uploads from THIS form session — if the user is just
    // detaching the previously-saved file, defer the delete until submit
    // so a cancel keeps the saved attachment intact.
    if (token && form.attachment_path && form.attachment_path !== initialAttachmentPath) {
      await deleteAttachment(form.attachment_path, token);
    }
    setForm(p => ({ ...p, attachment_path: '', attachment_name: '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_id) { setError('יש לבחור מטופלת'); return; }
    setSaving(true); setError('');

    const payload = {
      ...form,
      session_id:       form.session_id || null,
      attachment_path:  form.attachment_path || null,
      attachment_name:  form.attachment_name || null,
      duration_minutes: calcDuration(form.start_time, form.end_time),
    };

    const { error: err } = initial?.id
      ? await supabase.from('session_summaries').update(payload).eq('id', initial.id)
      : await supabase.from('session_summaries').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }

    // After a successful save: if the originally-loaded attachment was
    // detached or replaced, clean its storage object now (we deferred this
    // so that cancelling the form preserved it).
    if (
      initialAttachmentPath &&
      initialAttachmentPath !== form.attachment_path
    ) {
      const token = await getToken();
      if (token) await deleteAttachment(initialAttachmentPath, token);
    }
    onSave();
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));
  const sessionOptions = sessions.map(s => ({ value: s.id, label: `${s.date} ${s.start_time}` }));

  const attachmentSection = (
    <FormGroup title="קובץ מצורף">
      <div className="space-y-2">
        {form.attachment_path ? (
          <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
            <span className="text-teal-700" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span className="flex-1 text-sm text-slate-700 truncate">
              {form.attachment_name || 'קובץ מצורף'}
            </span>
            <button
              type="button"
              onClick={handleClearAttachment}
              className="text-xs text-red-600 hover:text-red-700 hover:underline"
            >
              הסר
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-teal-500 hover:bg-teal-50 transition-colors text-sm text-slate-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{uploading ? 'מעלה קובץ...' : 'הוסיפי קובץ (PDF / Word / תמונה, עד 10MB)'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
              className="hidden"
              disabled={uploading}
              onChange={e => handlePickFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {attachErr && (
          <p className="text-xs text-red-600">{attachErr}</p>
        )}
      </div>
    </FormGroup>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <FormGroup title="פרטי הפגישה">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="מטופלת *" value={form.patient_id} onChange={v => set('patient_id', v)} options={patientOptions} placeholder="בחרי מטופלת..." required />
          <SelectField label="פגישה מקושרת" value={form.session_id} onChange={v => set('session_id', v)} options={sessionOptions} placeholder="בחרי פגישה..." />
          <Field label="תאריך *" type="date" value={form.date} onChange={v => set('date', v)} required />
          <div className="grid grid-cols-2 gap-2">
            <Field label="משעה" type="time" value={form.start_time} onChange={v => set('start_time', v)} />
            <Field label="עד שעה" type="time" value={form.end_time} onChange={v => set('end_time', v)} />
          </div>
        </div>
      </FormGroup>

      {attachmentSection}

      <FormGroup title="תוכן הפגישה">
        <div className="space-y-3">
          <DictatedTextarea label="מצב נוכחי" value={form.current_state} onChange={v => set('current_state', v)} rows={2} />
          <DictatedTextarea label="נושאים חשובים שעלו" value={form.main_topics} onChange={v => set('main_topics', v)} rows={2} />
          <DictatedTextarea label="מה עשינו בטיפול" value={form.treatment_actions} onChange={v => set('treatment_actions', v)} rows={2} />
          <DictatedTextarea label="עם מה מתחילים בפגישה הבאה" value={form.next_steps} onChange={v => set('next_steps', v)} rows={2} />
        </div>
      </FormGroup>

      <FormGroup title="מעקב ומשימות">
        <div className="space-y-3">
          <DictatedTextarea label="משימות שקיבלה" value={form.tasks_given} onChange={v => set('tasks_given', v)} rows={2} />
          <DictatedTextarea label="התקדמות" value={form.progress} onChange={v => set('progress', v)} rows={2} />
          <DictatedTextarea label="קושי בהתקדמות" value={form.difficulties} onChange={v => set('difficulties', v)} rows={2} />
          <DictatedTextarea label="הערות נוספות" value={form.notes} onChange={v => set('notes', v)} rows={2} />
        </div>
      </FormGroup>

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving || uploading} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
