'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { SelectField, TextareaField } from '@/components/ui/FormField';

type PatientOpt = { id: string; full_name: string };

interface Props { onSave: () => void; onCancel: () => void; }

/* ── Quarter helpers ── */
interface Quarter { year: number; q: number; }

function currentQuarter(): Quarter {
  const now = new Date();
  return { year: now.getFullYear(), q: Math.floor(now.getMonth() / 3) + 1 };
}
/** ISO start/end dates of a quarter (end = last day of its 3rd month). */
function quarterRange({ year, q }: Quarter): { start: string; end: string } {
  const startMonth = (q - 1) * 3 + 1;
  const endMonth   = q * 3;
  const lastDay    = new Date(year, endMonth, 0).getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${year}-${p(startMonth)}-01`,
    end:   `${year}-${p(endMonth)}-${p(lastDay)}`,
  };
}
function quarterKey(x: Quarter)   { return `${x.year}-Q${x.q}`; }
function quarterLabel(x: Quarter) { return `רבעון ${x.q} · ${x.year}`; }
function prevQuarter(x: Quarter): Quarter {
  return x.q === 1 ? { year: x.year - 1, q: 4 } : { year: x.year, q: x.q - 1 };
}
/** "DD/MM/YYYY" from ISO, no timezone drift. */
function ddmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * AI-assisted "הוסף סיכום רבעון" flow:
 *   1. Pick a patient (only field). The current year+quarter is detected
 *      automatically and its date range is shown; switching to a previous
 *      quarter is a secondary option.
 *   2. The server summarizes ONLY the patient's session summaries inside the
 *      3 quarter months (no invented content) and returns a draft.
 *   3. The draft opens for editing and is saved only on explicit approval.
 */
export default function QuarterlyAiForm({ onSave, onCancel }: Props) {
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [patientId, setPatientId] = useState('');

  // Auto-detected quarter; previous quarters only via the secondary picker.
  const nowQ = useMemo(() => currentQuarter(), []);
  const [selectedKey, setSelectedKey] = useState(quarterKey(nowQ));
  const [showQuarterPicker, setShowQuarterPicker] = useState(false);

  const [step,  setStep]  = useState<'pick' | 'draft'>('pick');
  const [draft, setDraft] = useState('');
  const [count, setCount] = useState(0);

  const [busy,   setBusy]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    supabase.from('patients').select('id, full_name').order('full_name').then(({ data }) => setPatients(data ?? []));
  }, []);

  // Current quarter first, then the 7 before it.
  const quarterOptions = useMemo(() => {
    const list: Quarter[] = [nowQ];
    for (let i = 0; i < 7; i++) list.push(prevQuarter(list[list.length - 1]));
    return list.map(x => ({ value: quarterKey(x), label: quarterLabel(x), quarter: x }));
  }, [nowQ]);

  const selected = quarterOptions.find(o => o.value === selectedKey) ?? quarterOptions[0];
  const range    = quarterRange(selected.quarter);
  const isCurrent = selected.value === quarterKey(nowQ);

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));
  const patientName = patients.find(p => p.id === patientId)?.full_name ?? '';

  async function generate() {
    if (!patientId) { setError('יש לבחור מטופלת'); return; }
    setBusy(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError('נדרשת התחברות מחדש'); return; }
      const res = await fetch('/api/quarterly/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patient_id: patientId, start_date: range.start, end_date: range.end }),
      });
      const json = await res.json() as { draft?: string; count?: number; error?: string };
      if (!res.ok || !json.draft) {
        setError(json.error ?? 'שגיאה בייצור הטיוטה');
        return;
      }
      setDraft(json.draft);
      setCount(json.count ?? 0);
      setStep('draft');
    } catch {
      setError('שגיאה בתקשורת עם השרת');
    } finally {
      setBusy(false);
    }
  }

  async function approveAndSave() {
    if (!draft.trim()) { setError('הסיכום ריק'); return; }
    setSaving(true); setError('');
    // Row date: inside the summarized quarter so the list badge shows the
    // right quarter — today for the current quarter, quarter-end for a past one.
    const today = new Date().toISOString().slice(0, 10);
    const date = isCurrent ? today : range.end;
    const { error: err } = await supabase.from('quarterly_summaries').insert({
      patient_id: patientId,
      date,
      summary: draft.trim(),
      participants: null,
      duration_minutes: null,
      notes: null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
  }

  /* ── Step 1: patient only + auto quarter ── */
  if (step === 'pick') {
    return (
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

        <SelectField label="מטופלת *" value={patientId} onChange={setPatientId} options={patientOptions} placeholder="בחרי מטופלת..." required />

        {/* Auto-detected quarter + its date range */}
        <div style={{
          borderRadius: 10, padding: '12px 14px',
          backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
            {isCurrent ? 'הרבעון הנוכחי (זוהה אוטומטית)' : 'רבעון נבחר'}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A2332' }}>
            {selected.label}
          </div>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            טווח תאריכים: {ddmmyyyy(range.start)} – {ddmmyyyy(range.end)}
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>
            ה-AI יסכם רק את סיכומי הפגישות של המטופלת מתוך שלושת חודשי הרבעון — ללא מידע חיצוני.
          </div>
        </div>

        {/* Secondary option: switch to a previous quarter */}
        {!showQuarterPicker ? (
          <button
            type="button"
            onClick={() => setShowQuarterPicker(true)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: '#64748B', textDecoration: 'underline',
            }}
          >
            צריך רבעון קודם? שינוי רבעון
          </button>
        ) : (
          <SelectField
            label="בחירת רבעון (אפשרות משנית)"
            value={selectedKey}
            onChange={setSelectedKey}
            options={quarterOptions.map(o => ({ value: o.value, label: o.value === quarterKey(nowQ) ? `${o.label} (נוכחי)` : o.label }))}
          />
        )}

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors"
          >
            {busy ? 'מייצר טיוטה מסיכומי הפגישות...' : 'צור טיוטת סיכום ✨'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            ביטול
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 2: editable draft, saved only on approval ── */
  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
        padding: '10px 14px', borderRadius: 10,
        backgroundColor: '#F8FAFC', border: '1px solid #E8ECF0',
        fontSize: 12.5, color: '#64748B',
      }}>
        <span><b style={{ color: '#1A2332' }}>{patientName}</b></span>
        <span>{selected.label}</span>
        <span>{ddmmyyyy(range.start)} – {ddmmyyyy(range.end)}</span>
        <span style={{ color: '#0D9488', fontWeight: 600 }}>{count} סיכומי פגישות סוכמו</span>
      </div>

      <div style={{
        fontSize: 12, color: '#B45309', backgroundColor: '#FFFBEB',
        border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px',
      }}>
        זוהי טיוטה שנוצרה מסיכומי הפגישות בלבד. עברי עליה, ערכי במידת הצורך — והיא תישמר רק לאחר אישור.
      </div>

      <TextareaField label="טיוטת הסיכום (ניתן לעריכה)" value={draft} onChange={setDraft} rows={14} />

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={approveAndSave}
          disabled={saving}
          className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'שומר...' : 'אשר ושמור'}
        </button>
        <button
          type="button"
          onClick={() => { setStep('pick'); setError(''); }}
          disabled={saving}
          className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          → חזרה
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          ביטול
        </button>
      </div>
    </div>
  );
}
