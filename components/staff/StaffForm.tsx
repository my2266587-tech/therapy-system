'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import { useSettings } from '@/lib/settings/SettingsProvider';
import type { StaffMember } from '@/types';

interface Props { initial: StaffMember | null; onSave: () => void; onCancel: () => void; }

export default function StaffForm({ initial, onSave, onCancel }: Props) {
  const { settings } = useSettings();
  const ROLE_OPTIONS = settings.options.staffRole;
  const [form, setForm] = useState({
    full_name:       initial?.full_name       ?? '',
    phone:           initial?.phone           ?? '',
    email:           initial?.email           ?? '',
    role:            initial?.role            ?? 'other',
    employee_number: initial?.employee_number ?? '',
    notes:           initial?.notes           ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('שם הוא שדה חובה'); return; }
    setSaving(true); setError('');
    const { error: err } = initial?.id
      ? await supabase.from('staff').update(form).eq('id', initial.id)
      : await supabase.from('staff').insert(form);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="שם *" value={form.full_name} onChange={v => set('full_name', v)} required />
        <SelectField label="תפקיד" value={form.role} onChange={v => set('role', v)} options={ROLE_OPTIONS} />
        <Field label="טלפון" type="tel" value={form.phone} onChange={v => set('phone', v)} />
        <Field label="מייל" type="email" value={form.email} onChange={v => set('email', v)} />
        <Field label="מס׳ עובד" value={form.employee_number} onChange={v => set('employee_number', v)} />
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
