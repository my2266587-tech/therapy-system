'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Field } from '@/components/ui/FormField';
import DictatedTextarea from '@/components/ui/DictatedTextarea';
import type { Task } from '@/types';

/**
 * Slim add/edit form for the personal calendar view of the task board:
 * title, date + optional time, notes and a done status — nothing else.
 * Writes to the same `tasks` table; board-only fields (category, priority,
 * assignee, patient) are simply not touched on update.
 */
interface Props {
  /** Existing task to edit, or null to create. */
  initial: Task | null;
  /** Pre-filled date when adding from a specific calendar day. */
  defaultDate?: string;
  onSave: () => void;
  onCancel: () => void;
}

export default function PersonalPlanForm({ initial, defaultDate, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    title:    initial?.title ?? '',
    due_date: initial?.due_date ?? defaultDate ?? new Date().toISOString().slice(0, 10),
    due_time: initial?.due_time?.slice(0, 5) ?? '',
    notes:    initial?.description ?? '',
    is_done:  initial?.is_done ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(f: string, v: string | boolean) { setForm(p => ({ ...p, [f]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('יש להזין כותרת'); return; }
    if (!form.due_date)     { setError('יש לבחור תאריך'); return; }
    setSaving(true); setError('');
    const payload = {
      title:        form.title.trim(),
      due_date:     form.due_date,
      due_time:     form.due_time || null,
      description:  form.notes.trim() || null,
      is_done:      form.is_done,
      completed_at: form.is_done ? (initial?.completed_at ?? new Date().toISOString()) : null,
    };
    const { error: err } = initial?.id
      ? await supabase.from('tasks').update(payload).eq('id', initial.id)
      : await supabase.from('tasks').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <DictatedTextarea label="כותרת * (אפשר להכתיב 🎙)" value={form.title} onChange={v => set('title', v)} rows={1} placeholder="מה מתוכנן? — הקלידי או לחצי על המיקרופון" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="תאריך *" type="date" value={form.due_date} onChange={v => set('due_date', v)} required />
        <Field label="שעה (אופציונלי)" type="time" value={form.due_time} onChange={v => set('due_time', v)} />
      </div>
      <DictatedTextarea label="הערות (אפשר להכתיב 🎙)" value={form.notes} onChange={v => set('notes', v)} rows={3} placeholder="פרטים נוספים..." />

      {/* Done status */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        padding: '10px 12px', borderRadius: 10,
        backgroundColor: form.is_done ? '#F0FDF9' : '#F8FAFC',
        border: `1px solid ${form.is_done ? '#99F6E4' : '#E8ECF0'}`,
        transition: 'all 0.12s',
      }}>
        <span style={{
          width: 21, height: 21, flexShrink: 0, borderRadius: 7,
          border: `2px solid ${form.is_done ? '#0D9488' : '#CBD5E1'}`,
          backgroundColor: form.is_done ? '#0D9488' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s',
        }}>
          {form.is_done && (
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
        <input
          type="checkbox"
          checked={form.is_done}
          onChange={e => set('is_done', e.target.checked)}
          style={{ display: 'none' }}
        />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: form.is_done ? '#0D9488' : '#64748B' }}>
          {form.is_done ? 'הושלם' : 'סמני כשהושלם'}
        </span>
      </label>

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף ללוח'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
