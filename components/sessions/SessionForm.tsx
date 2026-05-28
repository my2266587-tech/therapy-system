'use client';

import { useState, useEffect, useMemo } from 'react';
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

/**
 * ILS reimbursement rate per traveled km. Israeli government rate at the
 * time of writing; update here if the rate changes. The form computes
 * travel_cost as distance × this rate and stores both columns so a future
 * rate change doesn't retroactively alter historical session costs.
 */
const TRAVEL_RATE_ILS_PER_KM = 2.49;

function calcDuration(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

function calcTravelCost(km: string): number | null {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * TRAVEL_RATE_ILS_PER_KM * 100) / 100;
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
    is_travel:   initial?.is_travel   ?? false,
    travel_distance_km: initial?.travel_distance_km != null
      ? String(initial.travel_distance_km)
      : '',
  });
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    supabase.from('patients').select('id, full_name').eq('status', 'active').order('full_name')
      .then(({ data }) => setPatients(data ?? []));
  }, []);

  function set<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm(p => ({ ...p, [field]: value }));
  }

  const travelCost = useMemo(
    () => form.is_travel ? calcTravelCost(form.travel_distance_km) : null,
    [form.is_travel, form.travel_distance_km],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_id) { setError('יש לבחור מטופלת'); return; }
    if (!form.start_time || !form.end_time) { setError('יש להזין שעות'); return; }
    setSaving(true); setError('');

    const distance = form.is_travel && form.travel_distance_km
      ? Number(form.travel_distance_km)
      : null;
    const cost = form.is_travel ? calcTravelCost(form.travel_distance_km) : null;

    const payload = {
      patient_id:         form.patient_id,
      date:               form.date,
      start_time:         form.start_time,
      end_time:           form.end_time,
      status:             form.status,
      notes:              form.notes,
      duration_minutes:   calcDuration(form.start_time, form.end_time),
      is_travel:          form.is_travel,
      travel_distance_km: distance,
      travel_cost:        cost,
    };

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
        * Toggle + (when on) distance input. Cost is computed live from
        * distance × TRAVEL_RATE_ILS_PER_KM and shown beside the input.
        * Both distance and the computed cost are persisted so historical
        * sessions aren't retroactively re-priced if the rate changes. */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        backgroundColor: form.is_travel ? '#F0FDF9' : '#F8FAFC',
        border: `1px solid ${form.is_travel ? '#99F6E4' : '#E2E8F0'}`,
        transition: 'background-color 0.12s, border-color 0.12s',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.is_travel}
            onChange={e => set('is_travel', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#0D9488' }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A2332' }}>
            כללה נסיעה
          </span>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            (ביקור בית או נסיעה אחרת בתשלום)
          </span>
        </label>

        {form.is_travel && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            marginTop: 12, alignItems: 'end',
          }}>
            <div>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: '#374151', marginBottom: 6,
              }}>
                מרחק כולל (ק"מ)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={form.travel_distance_km}
                onChange={e => set('travel_distance_km', e.target.value)}
                placeholder="לדוגמה: 24"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid #E2E8F0', fontSize: 14,
                  backgroundColor: '#FFFFFF', color: '#0F172A',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
            <div>
              <span style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: '#374151', marginBottom: 6,
              }}>
                עלות מוערכת
              </span>
              <div style={{
                padding: '9px 12px', borderRadius: 8,
                backgroundColor: '#FFFFFF', border: '1px solid #99F6E4',
                fontSize: 15, fontWeight: 700, color: '#0D9488',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {travelCost != null ? `${travelCost.toFixed(2)} ₪` : '—'}
              </div>
            </div>
            <p style={{
              gridColumn: '1 / -1', fontSize: 11, color: '#64748B', margin: 0,
            }}>
              חישוב לפי תעריף {TRAVEL_RATE_ILS_PER_KM} ₪ לק"מ.
              הערך נשמר עם הפגישה — שינוי עתידי של התעריף לא ישפיע על פגישות קיימות.
            </p>
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
