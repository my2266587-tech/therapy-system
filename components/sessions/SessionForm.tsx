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

const TRAVEL_MODE_OPTIONS = [
  { value: '',      label: 'ללא נסיעה' },
  { value: 'taxi',  label: 'מונית' },
  { value: 'bus',   label: 'אוטובוס' },
  { value: 'other', label: 'אחר' },
];

export const TRAVEL_MODE_LABEL: Record<string, string> = {
  taxi:  'מונית',
  bus:   'אוטובוס',
  other: 'אחר',
};

function calcDuration(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

interface Props { initial: Session | null; onSave: () => void; onCancel: () => void; onDelete?: () => void; }

export default function SessionForm({ initial, onSave, onCancel, onDelete }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    patient_id:  initial?.patient_id  ?? '',
    date:        initial?.date        ?? today,
    start_time:  initial?.start_time  ?? '',
    end_time:    initial?.end_time    ?? '',
    status:      initial?.status      ?? 'planned',
    notes:       initial?.notes       ?? '',
    travel_mode: initial?.travel_mode ?? '',
    travel_cost: initial?.travel_cost != null ? String(initial.travel_cost) : '',
  });
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    supabase.from('patients').select('id, full_name').eq('status', 'active').order('full_name')
      .then(({ data }) => setPatients(data ?? []));
  }, []);

  function set<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm(p => ({ ...p, [field]: value }));
  }

  const hasTravel = !!form.travel_mode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_id) { setError('יש לבחור מטופלת'); return; }
    if (!form.start_time || !form.end_time) { setError('יש להזין שעות'); return; }
    setSaving(true); setError('');

    // travel_cost only matters when there's a travel mode. Empty / NaN
    // gets stored as null so the column reflects "we don't know".
    const costNum = hasTravel && form.travel_cost
      ? Number(form.travel_cost)
      : null;
    const cost = Number.isFinite(costNum) && (costNum as number) >= 0 ? costNum : null;

    const payload = {
      patient_id:       form.patient_id,
      date:             form.date,
      start_time:       form.start_time,
      end_time:         form.end_time,
      status:           form.status,
      notes:            form.notes,
      duration_minutes: calcDuration(form.start_time, form.end_time),
      is_travel:        hasTravel,
      travel_mode:      hasTravel ? form.travel_mode : null,
      travel_cost:      cost,
    };

    const { error: err } = initial?.id
      ? await supabase.from('sessions').update(payload).eq('id', initial.id)
      : await supabase.from('sessions').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (!confirm('האם למחוק פגישה זו?')) return;
    setDeleting(true); setError('');
    const { error: err } = await supabase.from('sessions').delete().eq('id', initial.id);
    setDeleting(false);
    if (err) { setError(err.message); return; }
    onDelete?.();
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
        <SelectField label="סטטוס" value={form.status} onChange={v => set('status', v as typeof form.status)} options={STATUS_OPTIONS} />
        {form.start_time && form.end_time && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">משך מחושב</span>
            <span className="text-sm text-teal-700 font-medium pt-2">
              {calcDuration(form.start_time, form.end_time) ?? '-'} דקות
            </span>
          </div>
        )}
      </div>

      {/* ── Travel ──────────────────────────────────────────────────
        * Section with its own header. Mode dropdown ("ללא נסיעה /
        * מונית / אוטובוס / אחר"). When a mode is selected, the cost
        * input appears next to it. The cost is whatever the clinician
        * actually paid — no formula. Both columns persist; selecting
        * "ללא נסיעה" wipes them. */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        backgroundColor: hasTravel ? '#F0FDF9' : '#F8FAFC',
        border: `1px solid ${hasTravel ? '#99F6E4' : '#E2E8F0'}`,
        transition: 'background-color 0.12s, border-color 0.12s',
      }}>
        <h3 style={{
          fontSize: 13, fontWeight: 700, color: '#1A2332',
          margin: '0 0 10px', letterSpacing: '0.01em',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <span>🚗</span>
          <span>נסיעה</span>
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: hasTravel ? '1fr 1fr' : '1fr',
          gap: 12, alignItems: 'end',
        }}>
          <div>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#374151', marginBottom: 6,
            }}>
              סוג נסיעה
            </label>
            <select
              value={form.travel_mode}
              onChange={e => set('travel_mode', e.target.value as typeof form.travel_mode)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: '1px solid #E2E8F0', fontSize: 14,
                backgroundColor: '#FFFFFF', color: '#0F172A',
                outline: 'none', fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {TRAVEL_MODE_OPTIONS.map(o => (
                <option key={o.value || 'none'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {hasTravel && (
            <div>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: '#374151', marginBottom: 6,
              }}>
                עלות הנסיעה (₪)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.travel_cost}
                onChange={e => set('travel_cost', e.target.value)}
                placeholder="לדוגמה: 32"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid #E2E8F0', fontSize: 14,
                  backgroundColor: '#FFFFFF', color: '#0F172A',
                  outline: 'none', fontFamily: 'inherit',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
          )}
        </div>
      </div>

      <TextareaField label="הערות" value={form.notes} onChange={v => set('notes', v)} rows={2} />
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
        {initial?.id && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="ms-auto px-5 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'מוחק...' : 'מחק פגישה'}
          </button>
        )}
      </div>
    </form>
  );
}
