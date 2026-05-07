'use client';

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import FormGroup from '@/components/ui/FormGroup';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import type { Patient } from '@/types';
type StaffOpt = { id: string; full_name: string };

const STATUS_OPTIONS = [
  { value: 'active',   label: 'פעילה' },
  { value: 'inactive', label: 'לא פעילה' },
  { value: 'waiting',  label: 'בהמתנה' },
];

const HOUSING_OPTIONS = [
  { value: 'independent',    label: 'עצמאיות' },
  { value: 'regular',        label: 'רגיל' },
  { value: 'rehabilitation', label: 'משקם' },
];

interface Props {
  initial: Patient | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function PatientForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    full_name:         initial?.full_name ?? '',
    phone:             initial?.phone ?? '',
    email:             initial?.email ?? '',
    status:            initial?.status ?? 'active',
    coordinator_id:    initial?.coordinator_id ?? '',
    staff_id:          initial?.staff_id ?? '',
    apartment_address: initial?.apartment_address ?? '',
    housing_type:      initial?.housing_type ?? '',
    father_name:       initial?.father_name ?? '',
    mother_name:       initial?.mother_name ?? '',
    family_position:   initial?.family_position ?? '',
    home_address:      initial?.home_address ?? '',
    marital_status:    initial?.marital_status ?? '',
    notes:             initial?.notes ?? '',
  });
  const [staffList, setStaffList] = useState<StaffOpt[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

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
      staff_id:       form.staff_id || null,
      housing_type:   form.housing_type || null,
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
    <form onSubmit={handleSubmit} style={{ direction: 'rtl' }}>
      {error && (
        <div style={{
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
          color: '#B91C1C', fontSize: 13, padding: '10px 14px',
          borderRadius: 9, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* 1. Basic details */}
        <FormGroup title="פרטים בסיסיים">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="שם מטופלת *" value={form.full_name} onChange={v => set('full_name', v)} required />
            <SelectField label="סטטוס" value={form.status} onChange={v => set('status', v)} options={STATUS_OPTIONS} />
            <Field label="טלפון" type="tel" value={form.phone} onChange={v => set('phone', v)} />
            <Field label="מייל" type="email" value={form.email} onChange={v => set('email', v)} />
          </div>
        </FormGroup>

        {/* 2. Housing */}
        <FormGroup title="מידע מגורים">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SelectField label="סוג דירה" value={form.housing_type} onChange={v => set('housing_type', v)} options={HOUSING_OPTIONS} placeholder="בחרי..." />
            <div />
            <Field label="כתובת דירה" value={form.apartment_address} onChange={v => set('apartment_address', v)} />
            <Field label="כתובת מגורים" value={form.home_address} onChange={v => set('home_address', v)} />
          </div>
        </FormGroup>

        {/* 3. Family */}
        <FormGroup title="פרטי משפחה">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="שם אבא" value={form.father_name} onChange={v => set('father_name', v)} />
            <Field label="שם אמא" value={form.mother_name} onChange={v => set('mother_name', v)} />
            <Field label="מקום במשפחה" value={form.family_position} onChange={v => set('family_position', v)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="מצב משפחתי" value={form.marital_status} onChange={v => set('marital_status', v)} />
          </div>
        </FormGroup>

        {/* 4. Team */}
        <FormGroup title="שיוך לצוות">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SelectField label="רכזת אחראית" value={form.coordinator_id} onChange={v => set('coordinator_id', v)} options={staffOptions} placeholder="בחרי רכזת..." />
            <SelectField label="איש צוות אחראי" value={form.staff_id} onChange={v => set('staff_id', v)} options={staffOptions} placeholder="בחרי איש צוות..." />
          </div>
        </FormGroup>

        {/* 5. Notes */}
        <FormGroup title="הערות">
          <TextareaField label="" value={form.notes} onChange={v => set('notes', v)} placeholder="הערות נוספות..." rows={4} />
        </FormGroup>
      </div>

      {/* Sticky footer */}
      <div style={{
        display: 'flex', gap: 10, justifyContent: 'flex-start',
        marginTop: 24, paddingTop: 18, borderTop: '1px solid #E8ECF0',
        position: 'sticky', bottom: 0, backgroundColor: '#FFFFFF',
      }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '10px 22px', fontSize: 14, fontWeight: 600,
            color: '#FFFFFF', backgroundColor: '#0D9488',
            border: 'none', borderRadius: 9, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1, boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
            transition: 'opacity 0.15s',
          }}
        >
          {saving ? 'שומר...' : initial?.id ? 'עדכן פרטים' : 'הוסף מטופלת'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 500,
            color: '#64748B', backgroundColor: '#FFFFFF',
            border: '1px solid #E8ECF0', borderRadius: 9, cursor: 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC';
            (e.currentTarget as HTMLElement).style.color = '#1A2332';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '#FFFFFF';
            (e.currentTarget as HTMLElement).style.color = '#64748B';
          }}
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
