'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  exportPatientCardPdf,
  type PatientCardSection,
  type PatientCardDocument,
  type PatientCardPayment,
} from '@/lib/patientCardPdf';
import type { Patient, Session, SessionSummary } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  patient: Patient;
  linkedStaff: { full_name: string; role: string }[];
  sessions: Session[];
  summaries: SessionSummary[];
}

/** The sections offered in the export modal, in display order. משימות/תזכורות is
 *  intentionally absent — that module doesn't exist yet (it's a "בקרוב" tab with
 *  no data source). */
const SECTIONS: { key: PatientCardSection; label: string }[] = [
  { key: 'details',   label: 'פרטי מטופלת' },
  { key: 'sessions',  label: 'פגישות' },
  { key: 'summaries', label: 'סיכומי פגישות' },
  { key: 'documents', label: 'מסמכים / קבצים' },
  { key: 'payments',  label: 'תשלומים' },
  { key: 'notes',     label: 'הערות כלליות' },
];

const C = {
  accent: '#0D9488', border: '#E8ECF0', text: '#1A2332',
  sub: '#64748B', muted: '#94A3B8',
};

export default function PatientCardExportModal({
  open, onClose, patient, linkedStaff, sessions, summaries,
}: Props) {
  const [checked, setChecked] = useState<Record<PatientCardSection, boolean>>({
    details: true, sessions: true, summaries: true,
    documents: true, payments: true, notes: true,
  });
  // How many of the most-recent summaries to include. Empty = all.
  const [summariesCount, setSummariesCount] = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggle = (key: PatientCardSection) =>
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));

  const selected = SECTIONS.filter(s => checked[s.key]).map(s => s.key);

  async function token(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function fetchDocuments(): Promise<PatientCardDocument[]> {
    try {
      const t = await token();
      if (!t) return [];
      const res = await fetch(`/api/patients/${patient.id}/documents`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) return [];
      const json = await res.json() as PatientCardDocument[];
      return json.map(d => ({
        file_name: d.file_name, mime_type: d.mime_type,
        uploaded_at: d.uploaded_at, file_size: d.file_size,
      }));
    } catch {
      return [];
    }
  }

  async function fetchPayments(): Promise<PatientCardPayment[]> {
    // Payments link to a patient only through a session summary (payments.summary_id).
    const summaryIds = summaries.map(s => s.id);
    if (summaryIds.length === 0) return [];
    const { data, error: err } = await supabase
      .from('payments')
      .select('amount, is_paid, payment_method, received_date, month, notes, summary:summary_id(date)')
      .in('summary_id', summaryIds);
    if (err || !data) return [];
    return (data as unknown as Array<{
      amount: number; is_paid: boolean; payment_method: string | null;
      received_date: string | null; month: string | null; notes: string | null;
      summary: { date: string } | null;
    }>).map(p => ({
      date: p.summary?.date ?? p.received_date ?? null,
      month: p.month,
      amount: p.amount,
      is_paid: p.is_paid,
      payment_method: p.payment_method,
      notes: p.notes,
    }));
  }

  async function handleDownload() {
    if (selected.length === 0) { setError('יש לבחור לפחות מקטע אחד'); return; }
    setBusy(true);
    setError(null);
    try {
      const documents = checked.documents ? await fetchDocuments() : [];
      const payments  = checked.payments  ? await fetchPayments()  : [];
      // Limit to the N most recent summaries (newest → oldest) when a count
      // was entered. A count larger than what exists simply includes all.
      const n = parseInt(summariesCount, 10);
      const limitedSummaries = checked.summaries && Number.isFinite(n) && n > 0
        ? [...summaries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n)
        : summaries;
      await exportPatientCardPdf(
        { patient, linkedStaff, sessions, summaries: limitedSummaries, documents, payments },
        selected,
      );
      onClose();
    } catch (e) {
      console.error('[patient-card export]', e);
      setError('שגיאה בהפקת ה-PDF. נסי שוב.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, direction: 'rtl',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>
            הורדת כרטיס מטופלת
          </h2>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            בחרי אילו מקטעים לכלול ב-PDF של {patient.full_name}
          </p>
        </div>

        {/* Checkboxes */}
        <div style={{ padding: '14px 24px' }}>
          {SECTIONS.map(s => (
            <div key={s.key}>
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: 11,
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${checked[s.key] ? '#99F6E4' : C.border}`,
                  backgroundColor: checked[s.key] ? '#F0FDF9' : '#FFFFFF',
                  marginBottom: 8, transition: 'all 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked[s.key]}
                  onChange={() => toggle(s.key)}
                  style={{ width: 17, height: 17, accentColor: C.accent, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{s.label}</span>
              </label>

              {/* How many recent summaries to include (empty = all) */}
              {s.key === 'summaries' && checked.summaries && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  margin: '-2px 0 8px', padding: '8px 12px 8px 12px',
                  marginRight: 24,
                  borderRight: `2px solid #99F6E4`,
                }}>
                  <span style={{ fontSize: 12.5, color: C.sub, whiteSpace: 'nowrap' }}>
                    כמה סיכומים אחרונים?
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={summariesCount}
                    onChange={e => setSummariesCount(e.target.value)}
                    placeholder={`הכל (${summaries.length})`}
                    style={{
                      width: 90, padding: '6px 10px', borderRadius: 8, fontSize: 13,
                      border: `1px solid ${C.border}`, color: C.text, outline: 'none',
                      fontFamily: 'inherit',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#0F766E'; }}
                    onBlur={e => { e.target.style.borderColor = C.border; }}
                  />
                  <span style={{ fontSize: 11.5, color: C.muted }}>
                    ריק = הכל · מהחדש לישן
                  </span>
                </div>
              )}
            </div>
          ))}

          {error && (
            <p style={{
              fontSize: 13, color: '#DC2626', backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', margin: '6px 0 0',
            }}>
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: 10, padding: '14px 24px 20px',
          borderTop: `1px solid ${C.border}`,
        }}>
          <button
            onClick={handleDownload}
            disabled={busy}
            style={{
              flex: 1, backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
            }}
          >
            {busy ? 'מפיק PDF...' : 'הורד PDF'}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '11px 18px', fontSize: 14, color: C.sub,
              border: `1px solid ${C.border}`, borderRadius: 10,
              backgroundColor: '#FFFFFF', cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
