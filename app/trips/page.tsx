'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import TripForm from '@/components/trips/TripForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import { hebrewDay } from '@/lib/dateUtils';
import { tripTypeLabel } from '@/lib/trips';
import type { Trip } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const TRIP_EXPORT_COLUMNS: Column<Trip>[] = [
  { header: 'תאריך',     accessor: r => new Date(r.date), width: 14 },
  { header: 'יום',       accessor: r => hebrewDay(r.date), width: 10 },
  { header: 'מטופלת',    accessor: r => (r.patient as { full_name?: string } | null)?.full_name ?? '', width: 22 },
  { header: 'סוג נסיעה', accessor: r => tripTypeLabel(r.trip_type), width: 18 },
  { header: 'סכום (₪)',   accessor: r => Number(r.amount), width: 12 },
  { header: 'הערות',     accessor: r => r.notes ?? '', width: 28 },
];

/** Signed receipt URLs in the employer report stay valid this long. */
const EXPORT_LINK_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const filterInput: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px',
  fontSize: 13, backgroundColor: '#FFFFFF', color: C.text,
  outline: 'none', fontFamily: 'inherit',
};

export default function TripsPage() {
  const [records, setRecords] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  // Signed URL per receipt_path — used by the list indicator and embedded
  // as links in the employer export.
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});

  // Filters: date range + patient
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');
  const [patientId, setPatientId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('trips')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    const rows = (data ?? []) as Trip[];
    setRecords(rows);
    setLoading(false);

    // Resolve signed URLs for all receipts (long TTL so exported reports
    // keep working). Best-effort — failure leaves rows without a link.
    const paths = rows.map(r => r.receipt_path).filter((p): p is string => !!p);
    if (paths.length === 0) { setReceiptUrls({}); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/trips/sign-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paths, expires_in: EXPORT_LINK_TTL_SECONDS }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.urls) setReceiptUrls(json.urls as Record<string, string>);
    } catch {
      // Indicator still shows; opening will just be unavailable.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק נסיעה זו?')) return;
    const rec = records.find(r => r.id === id);
    const { error } = await supabase.from('trips').delete().eq('id', id);
    // Clean up the orphaned receipt object (best-effort).
    if (!error && rec?.receipt_path) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          await fetch('/api/trips/delete-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ path: rec.receipt_path }),
          });
        }
      } catch { /* best-effort */ }
    }
    load();
  }

  // Export columns: the shared set + a receipt column whose cells link to
  // the signed receipt URL (Excel hyperlink / PDF link annotation).
  const exportColumns = useMemo<Column<Trip>[]>(() => [
    ...TRIP_EXPORT_COLUMNS,
    {
      header: 'קבלה',
      accessor: r => r.receipt_path ? 'צפייה בקבלה' : '',
      width: 16,
      link: r => (r.receipt_path ? receiptUrls[r.receipt_path] ?? null : null),
    },
  ], [receiptUrls]);

  // Patient options are derived from the loaded records so the filter only
  // offers names that actually appear in the list.
  const patientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      const name = (r.patient as { full_name?: string } | null)?.full_name;
      if (r.patient_id && name) map.set(r.patient_id, name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [records]);

  const filtered = records.filter(r =>
    (!fromDate  || r.date >= fromDate) &&
    (!toDate    || r.date <= toDate) &&
    (!patientId || r.patient_id === patientId)
  );

  const hasFilter = !!(fromDate || toDate || patientId);
  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);
  const totalLabel = `₪${total.toLocaleString('he-IL', { minimumFractionDigits: 2 })}`;

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              נסיעות
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${filtered.length} נסיעות${hasFilter && filtered.length !== records.length ? ` מתוך ${records.length}` : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<Trip>
              rows={filtered}
              columns={exportColumns}
              title="נסיעות"
              fileBase="trips"
              summary={`סה"כ: ${totalLabel}`}
              disabled={loading}
            />
            <button
              onClick={() => { setEditing(null); setOpen(true); }}
              style={{
                backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
                borderRadius: 10, padding: '10px 20px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
                boxShadow: `0 2px 8px rgba(13,148,136,0.22)`, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              + הוסף נסיעה
            </button>
          </div>
        </div>

        {/* Total card */}
        {records.length > 0 && (
          <div style={{
            backgroundColor: C.card, borderRadius: 14,
            border: `1px solid #FDE68A`,
            boxShadow: `0 2px 10px rgba(245,158,11,0.08)`,
            padding: '20px 22px', marginBottom: 24,
            borderTop: `2px solid #F59E0B`,
          }}>
            <p style={{
              fontSize: 11, fontWeight: 600, color: '#92400E', margin: '0 0 10px',
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              {hasFilter ? 'סה"כ (לפי הסינון)' : 'סה"כ נסיעות'}
            </p>
            <p style={{
              fontSize: 32, fontWeight: 700, margin: 0, lineHeight: 1,
              color: '#F59E0B',
            }}>
              {totalLabel}
            </p>
          </div>
        )}

        {/* Filters: date range + patient */}
        {!loading && records.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12,
            backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
            boxShadow: C.shadow, padding: '14px 18px', marginBottom: 20,
          }}>
            <FilterField label="מתאריך">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={filterInput} />
            </FilterField>
            <FilterField label="עד תאריך">
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={filterInput} />
            </FilterField>
            <FilterField label="מטופלת">
              <select value={patientId} onChange={e => setPatientId(e.target.value)} style={{ ...filterInput, minWidth: 170, cursor: 'pointer' }}>
                <option value="">כל המטופלות</option>
                {patientOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FilterField>
            {hasFilter && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); setPatientId(''); }}
                style={{
                  backgroundColor: 'transparent', border: 'none', color: C.accent,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 4px',
                }}
              >
                נקה סינון
              </button>
            )}
          </div>
        )}

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : filtered.length === 0 ? (
          <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '42px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין נסיעות התואמות לסינון</p>
            <button
              onClick={() => { setFromDate(''); setToDate(''); setPatientId(''); }}
              style={{
                backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.sub,
                borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8,
              }}
            >
              נקה סינון
            </button>
          </div>
        ) : (
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow,
            overflow: 'hidden',
          }}>
            {filtered.map((r, i) => (
              <div
                key={r.id}
                onClick={() => { setEditing(r); setOpen(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 18,
                  padding: '16px 24px', cursor: 'pointer',
                  borderBottom: i < filtered.length - 1 ? `1px solid #F1F5F9` : 'none',
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
              >
                {/* Date badge */}
                <div style={{
                  minWidth: 54, textAlign: 'center', flexShrink: 0,
                  backgroundColor: '#F6F8FB', border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '8px 6px',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1 }}>
                    {new Date(r.date).getDate()}
                  </p>
                  <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', textTransform: 'uppercase' }}>
                    {new Date(r.date).toLocaleDateString('he-IL', { month: 'short' })}
                  </p>
                  <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>
                    {hebrewDay(r.date)}
                  </p>
                </div>

                {/* Patient + notes */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                    {(r.patient as { full_name?: string } | null)?.full_name ?? '—'}
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: '3px 0 0' }}>
                    {r.notes ? r.notes.slice(0, 50) : '—'}{r.notes && r.notes.length > 50 ? '…' : ''}
                  </p>
                </div>

                {/* Receipt indicator — click opens the file */}
                {r.receipt_path && (
                  <span
                    onClick={e => {
                      e.stopPropagation();
                      const url = receiptUrls[r.receipt_path!];
                      if (url) window.open(url, '_blank', 'noopener');
                    }}
                    title={r.receipt_name ? `קבלה: ${r.receipt_name}` : 'צפייה בקבלה'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11.5, fontWeight: 700, color: '#B45309', flexShrink: 0,
                      backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
                      borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap',
                      cursor: receiptUrls[r.receipt_path] ? 'pointer' : 'default',
                    }}
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    קבלה
                  </span>
                )}

                {/* Trip type badge */}
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.accent, flexShrink: 0,
                  backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
                  borderRadius: 999, padding: '4px 12px', whiteSpace: 'nowrap',
                }}>
                  {tripTypeLabel(r.trip_type)}
                </span>

                {/* Amount */}
                <span style={{
                  fontSize: 15, fontWeight: 700, color: C.text,
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  ₪{Number(r.amount).toFixed(2)}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                  <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                  <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                </div>
              </div>
            ))}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: C.muted,
              backgroundColor: '#F8FAFC', borderTop: `1px solid #F1F5F9`,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{filtered.length} נסיעות</span>
              <span style={{ fontWeight: 600, color: C.sub }}>סה"כ: {totalLabel}</span>
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת נסיעה' : 'הוספת נסיעה'}>
        <TripForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>{label}</span>
      {children}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {[1,2,3,4,5].map((i, idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 24px', borderBottom: idx < 4 ? `1px solid #F1F5F9` : 'none' }}>
          <div style={{ width: 54, height: 40, borderRadius: 10, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '25%', marginBottom: 8 }} />
            <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '30%' }} />
          </div>
          <div style={{ height: 14, width: 70, backgroundColor: '#F1F5F9', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין נסיעות עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת הנסיעה הראשונה</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף נסיעה
      </button>
    </div>
  );
}
