'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import FormGroup from '@/components/ui/FormGroup';
import { Field, SelectField, TextareaField } from '@/components/ui/FormField';
import { useSettings } from '@/lib/settings/SettingsProvider';
import type { Patient } from '@/types';
type StaffOpt = { id: string; full_name: string; role?: string; is_active?: boolean };

interface Props {
  initial: Patient | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function PatientForm({ initial, onSave, onCancel }: Props) {
  const { settings } = useSettings();
  const STATUS_OPTIONS  = settings.options.patientStatus;
  const HOUSING_OPTIONS = settings.options.housingType;
  const [form, setForm] = useState({
    full_name:         initial?.full_name ?? '',
    phone:             initial?.phone ?? '',
    email:             initial?.email ?? '',
    status:            initial?.status ?? 'active',
    coordinator_id:    initial?.coordinator_id ?? '',
    apartment_address: initial?.apartment_address ?? '',
    housing_type:      initial?.housing_type ?? '',
    father_name:       initial?.father_name ?? '',
    mother_name:       initial?.mother_name ?? '',
    family_position:   initial?.family_position ?? '',
    home_address:      initial?.home_address ?? '',
    marital_status:    initial?.marital_status ?? '',
    notes:             initial?.notes ?? '',
  });

  /**
   * Multiple staff can be assigned to a patient. The full set lives in
   * staff_patients (many-to-many). For backwards compatibility we keep
   * patients.staff_id pointed at the FIRST selected staff — every read
   * path that still uses patients.staff_id (calendar, header, assistant
   * tools, monthly reports) continues to resolve to "the primary".
   */
  const [staffIds, setStaffIds] = useState<string[]>(
    initial?.staff_id ? [initial.staff_id] : [],
  );

  const [staffList, setStaffList] = useState<StaffOpt[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  /* ── load staff dropdown options ─────────────────────────────── */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // select('*') (not an explicit column list) so this keeps working even
    // before the is_active migration lands — a missing column is just absent,
    // not a PostgREST error.
    supabase.from('staff').select('*').order('full_name').then(({ data }) => {
      setStaffList((data ?? []) as StaffOpt[]);
    });
  }, []);

  /* ── on edit: union staff_patients with the legacy staff_id ──── */
  useEffect(() => {
    if (!initial?.id || !isSupabaseConfigured) return;
    let cancelled = false;
    supabase
      .from('staff_patients')
      .select('staff_id')
      .eq('patient_id', initial.id)
      .then(({ data, error: err }) => {
        if (cancelled || err || !data) return;
        const joined = data.map(r => (r as { staff_id: string }).staff_id);
        // Keep the legacy staff_id first so it remains "primary" after
        // a no-op edit (user opens the form, hits save without changes).
        const ordered = initial.staff_id
          ? [initial.staff_id, ...joined.filter(id => id !== initial.staff_id)]
          : joined;
        setStaffIds(ordered);
      });
    return () => { cancelled = true; };
  }, [initial?.id, initial?.staff_id]);

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
      // First selected = primary (kept for legacy reads). null when none.
      staff_id:       staffIds[0] ?? null,
      housing_type:   form.housing_type || null,
      marital_status: form.marital_status || null,
    };

    // 1. Upsert the patient row.
    let patientId: string | null = initial?.id ?? null;
    if (initial?.id) {
      const { error: err } = await supabase
        .from('patients').update(payload).eq('id', initial.id);
      if (err) { setSaving(false); setError(err.message); return; }
    } else {
      const { data, error: err } = await supabase
        .from('patients').insert(payload).select('id').single();
      if (err || !data) {
        setSaving(false);
        setError(err?.message ?? 'שגיאה ביצירת המטופלת');
        return;
      }
      patientId = (data as { id: string }).id;
    }

    // 2. Sync staff_patients (insert added, delete removed).
    if (patientId) {
      // Fetch what's currently linked so we only touch the diff.
      const { data: existing } = await supabase
        .from('staff_patients')
        .select('staff_id')
        .eq('patient_id', patientId);
      const existingIds = new Set(((existing ?? []) as { staff_id: string }[]).map(r => r.staff_id));
      const targetIds   = new Set(staffIds);

      const toInsert = [...targetIds].filter(id => !existingIds.has(id));
      const toDelete = [...existingIds].filter(id => !targetIds.has(id));

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('staff_patients')
          .insert(toInsert.map(sid => ({ staff_id: sid, patient_id: patientId })));
        // Non-fatal — the patient row already saved. Surface so the
        // user can retry, but don't roll the patient back.
        if (insErr) {
          setSaving(false);
          setError(`המטופלת נשמרה, אבל לא הצלחתי לקשר את כל אנשי הצוות: ${insErr.message}`);
          return;
        }
      }
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('staff_patients')
          .delete()
          .eq('patient_id', patientId)
          .in('staff_id', toDelete);
        if (delErr) {
          setSaving(false);
          setError(`המטופלת נשמרה, אבל לא הצלחתי להסיר חלק מהקישורים הישנים: ${delErr.message}`);
          return;
        }
      }
    }

    setSaving(false);
    onSave();
  }

  // Suspended (is_active === false) staff drop out of NEW selections, but a
  // member already chosen on this patient stays visible so editing never
  // silently clears an existing assignment.
  const coordinatorPickList = staffList.filter(
    s => s.is_active !== false || s.id === form.coordinator_id,
  );
  const teamPickList = staffList.filter(
    s => s.is_active !== false || staffIds.includes(s.id),
  );
  const staffOptions = coordinatorPickList.map(s => ({ value: s.id, label: s.full_name }));

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
            <SelectField
              label="רכזת אחראית"
              value={form.coordinator_id}
              onChange={v => set('coordinator_id', v)}
              options={staffOptions}
              placeholder="בחרי רכזת..."
            />
            <StaffMultiSelect
              label="אנשי צוות אחראים"
              value={staffIds}
              options={teamPickList}
              onChange={setStaffIds}
            />
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

/* ── Multi-select for staff assignments ─────────────────────────────
 *
 * Local to PatientForm because there's no shared component for this
 * pattern yet. Renders as:
 *   - a row of chips for the currently-selected staff (first = primary,
 *     subtle marker; × button per chip removes it)
 *   - a "open list" button that toggles a checkbox panel underneath
 *
 * Order matters — index 0 is what gets written to patients.staff_id.
 * Reordering by drag would be nice; today the user can re-pick to
 * change "primary" (clearing and re-adding promotes the new one).
 * ─────────────────────────────────────────────────────────────────── */

function StaffMultiSelect({
  label, value, options, onChange,
}: {
  label:   string;
  value:   string[];
  options: StaffOpt[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const byId = useMemo(() => {
    const m = new Map<string, StaffOpt>();
    for (const s of options) m.set(s.id, s);
    return m;
  }, [options]);

  function toggle(id: string) {
    onChange(
      value.includes(id)
        ? value.filter(v => v !== id)
        : [...value, id],
    );
  }

  function remove(id: string) {
    onChange(value.filter(v => v !== id));
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 500,
        color: '#475569', marginBottom: 6,
      }}>
        {label}
      </label>

      {/* Trigger area: chips + open button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          minHeight: 38, padding: '6px 10px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E8ECF0', borderRadius: 9,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          cursor: 'pointer', fontSize: 13,
        }}
      >
        {value.length === 0 ? (
          <span style={{ color: '#94A3B8' }}>בחרי אנשי צוות...</span>
        ) : (
          value.map((id, i) => {
            const s = byId.get(id);
            const name = s?.full_name ?? '(לא נמצא)';
            const isPrimary = i === 0;
            return (
              <span
                key={id}
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3px 8px 3px 4px',
                  borderRadius: 14,
                  backgroundColor: isPrimary ? '#F0FDF9' : '#F8FAFC',
                  color: isPrimary ? '#0D9488' : '#475569',
                  border: `1px solid ${isPrimary ? '#99F6E4' : '#E8ECF0'}`,
                  fontSize: 12, fontWeight: 500,
                }}
                title={isPrimary ? 'איש הצוות הראשי — נשמר ב-staff_id של המטופלת' : ''}
              >
                {name}
                {isPrimary && (
                  <span style={{ fontSize: 10, opacity: 0.8 }}>· ראשי</span>
                )}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  aria-label={`הסר ${name}`}
                  style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,0.06)',
                    color: 'inherit', fontSize: 11, lineHeight: 1,
                    cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
        <span style={{
          marginInlineStart: 'auto', fontSize: 11, color: '#94A3B8',
        }}>
          {open ? '▴' : '▾'}
        </span>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0,
          marginTop: 4, zIndex: 20,
          backgroundColor: '#FFFFFF', borderRadius: 9,
          border: '1px solid #E8ECF0',
          boxShadow: '0 6px 24px rgba(15, 23, 42, 0.10)',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {options.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: '#94A3B8' }}>
              אין אנשי צוות במערכת.
            </div>
          ) : (
            options.map((s, i) => {
              const checked = value.includes(s.id);
              return (
                <label
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: i < options.length - 1 ? '1px solid #F1F5F9' : 'none',
                    backgroundColor: checked ? '#F0FDF9' : '#FFFFFF',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s.id)}
                    style={{ flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A2332', flex: 1 }}>
                    {s.full_name}
                  </span>
                  {s.role && (
                    <span style={{
                      fontSize: 11, color: '#64748B',
                      padding: '2px 8px', borderRadius: 12,
                      backgroundColor: '#F1F5F9',
                    }}>
                      {s.role}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      )}

      <p style={{
        fontSize: 11, color: '#94A3B8', margin: '5px 2px 0', lineHeight: 1.4,
      }}>
        ניתן לבחור כמה אנשי צוות. הראשון בסדר ייחשב לאיש צוות הראשי.
      </p>
    </div>
  );
}
