'use client';

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import FormGroup from '@/components/ui/FormGroup';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import type { Patient } from '@/types';
type StaffOpt = { id: string; full_name: string };

const STATUS_OPTIONS = [
  { value: 'active', label: 'פעילה' },
  { value: 'inactive', label: 'לא פעילה' },
  { value: 'waiting', label: 'בהמתנה' },
];

const HOUSING_OPTIONS = [
  { value: 'independent', label: 'עצמאיות' },
  { value: 'regular', label: 'רגיל' },
  { value: 'rehabilitation', label: 'משקם' },
];

interface Props {
  initial: Patient | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function PatientForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    full_name: initial?.full_name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    status: initial?.status ?? 'active',
    coordinator_id: initial?.coordinator_id ?? '',
    staff_id: initial?.staff_id ?? '',
    apartment_address: initial?.apartment_address ?? '',
    housing_type: initial?.housing_type ?? '',
    father_name: initial?.father_name ?? '',
    mother_name: initial?.mother_name ?? '',
    family_position: initial?.family_position ?? '',
    home_address: initial?.home_address ?? '',
    marital_status: initial?.marital_status ?? '',
    notes: initial?.notes ?? '',
  });
  const [staffList, setStaffList] = useState<StaffOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.from('staff').select('id, full_name, role').order('full_name').then(({ data }) => {
      setStaffList(data ?? []);
    });
  }, []);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('יש להגדיר חיבור Supabase לפני שמירת נתונים');
      return;
    }
    if (!form.full_name.trim()) { setError('שם מטופלת הוא שדה חובה'); return; }
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      coordinator_id: form.coordinator_id || null,
      staff_id: form.staff_id || null,
      housing_type: form.housing_type || null,
      marital_status: form.marital_status || null,
    };

    const { error: err } = initial?.id
      ? await supabase.from('patients').update(payload).eq('id', initial.id)
      : await supabase.from('patients').insert(payload);

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  const staffOptions = staffList.map(s => ({ value: s.id, label: s.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <FormGroup title="פרטי קשר">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="שם מטופלת *" value={form.full_name} onChange={v => set('full_name', v)} required />
          <Field label="טלפון" type="tel" value={form.phone} onChange={v => set('phone', v)} />
          <Field label="מייל" type="email" value={form.email} onChange={v => set('email', v)} />
          <SelectField label="סטטוס" value={form.status} onChange={v => set('status', v)} options={STATUS_OPTIONS} />
        </div>
      </FormGroup>

      <FormGroup title="מידע מגורים">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="סוג דירה" value={form.housing_type} onChange={v => set('housing_type', v)} options={HOUSING_OPTIONS} placeholder="בחרי..." />
          <Field label="מצב משפחתי" value={form.marital_status} onChange={v => set('marital_status', v)} />
          <Field label="כתובת דירה" value={form.apartment_address} onChange={v => set('apartment_address', v)} />
          <Field label="כתובת מגורים" value={form.home_address} onChange={v => set('home_address', v)} />
        </div>
      </FormGroup>

      <FormGroup title="פרטי משפחה">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="שם אבא" value={form.father_name} onChange={v => set('father_name', v)} />
          <Field label="שם אמא" value={form.mother_name} onChange={v => set('mother_name', v)} />
          <Field label="מקום במשפחה" value={form.family_position} onChange={v => set('family_position', v)} />
        </div>
      </FormGroup>

      <FormGroup title="שיוך לצוות">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="רכזת אחראית" value={form.coordinator_id} onChange={v => set('coordinator_id', v)} options={staffOptions} placeholder="בחרי רכזת..." />
          <SelectField label="איש צוות אחראי" value={form.staff_id} onChange={v => set('staff_id', v)} options={staffOptions} placeholder="בחרי איש צוות..." />
        </div>
      </FormGroup>

      <FormGroup title="הערות">
        <TextareaField label="" value={form.notes} onChange={v => set('notes', v)} placeholder="הערות נוספות..." />
      </FormGroup>

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          ביטול
        </button>
      </div>
    </form>
  );
}
