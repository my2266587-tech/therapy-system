'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import PaymentForm from '@/components/payments/PaymentForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import SearchBar, { SearchEmpty } from '@/components/ui/SearchBar';
import { paymentMethodLabels, emailStatusLabels } from '@/lib/labels';
import { hebrewLong } from '@/lib/dateUtils';
import type { Payment } from '@/types';

/**
 * Resolve the date to show for a payment row. Prefer a real day over the
 * month-only field so we can render a normal DD/MM/YYYY date:
 *   1. the linked session summary's date (auto-created שיראל rows)
 *   2. received_date (manual rows that recorded a day)
 *   3. fallback: the YYYY-MM month, shown as MM/YYYY with no Hebrew date.
 * Never throws and never blanks an existing row.
 */
function paymentDisplayDate(r: Payment): { greg: string; hebrew: string } {
  const iso = (r.summary as { date?: string } | null)?.date || r.received_date;
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return { greg: `${d}/${m}/${y}`, hebrew: hebrewLong(iso) };
  }
  if (r.month && /^\d{4}-\d{2}/.test(r.month)) {
    const [y, m] = r.month.split('-');
    return { greg: `${m}/${y}`, hebrew: '' };
  }
  return { greg: r.month ?? '', hebrew: '' };
}

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const PAID_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  true:  { label: 'שולם',    bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
  false: { label: 'טרם שולם', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
};

const EMAIL_STATUS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  not_sent: { label: 'לא נשלח',  bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' },
  sent:     { label: 'נשלח',    bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4' },
  failed:   { label: 'כשל',     bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
};

const PAYMENT_EXPORT_COLUMNS: Column<Payment>[] = [
  { header: 'חודש',          accessor: r => r.month, width: 14 },
  { header: 'סכום (₪)',       accessor: r => Number(r.amount), width: 14 },
  { header: 'שולם',           accessor: r => r.is_paid ? 'שולם' : 'טרם שולם', width: 14 },
  { header: 'אמצעי תשלום',   accessor: r => r.payment_method ? (paymentMethodLabels[r.payment_method] ?? r.payment_method) : '', width: 18 },
  { header: 'תאריך קבלה',    accessor: r => r.received_date ?? '', width: 14 },
  { header: 'רכזת',           accessor: r => (r.coordinator as { full_name?: string } | null)?.full_name ?? '', width: 20 },
  { header: 'סטטוס מייל',    accessor: r => emailStatusLabels[r.email_status] ?? r.email_status, width: 14 },
  { header: 'הערות',          accessor: r => r.notes ?? '', width: 28 },
];

export default function PaymentsPage() {
  const [records, setRecords] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payments')
      .select('*, coordinator:coordinator_id(full_name), summary:summary_id(date)')
      .order('month', { ascending: false });
    setRecords((data ?? []) as Payment[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק תשלום זה?')) return;
    await supabase.from('payments').delete().eq('id', id);
    load();
  }

  const totalPaid   = records.filter(r => r.is_paid).reduce((s, r) => s + Number(r.amount), 0);
  const totalUnpaid = records.filter(r => !r.is_paid).reduce((s, r) => s + Number(r.amount), 0);

  const q = search.trim().toLowerCase();
  const filtered = q === '' ? records : records.filter(r => {
    const haystack = [
      r.month, String(r.amount),
      r.payment_method ? (paymentMethodLabels[r.payment_method] ?? r.payment_method) : '',
      r.received_date, (r.coordinator as { full_name?: string } | null)?.full_name,
      r.is_paid ? 'שולם' : 'טרם שולם', emailStatusLabels[r.email_status] ?? r.email_status,
      r.notes,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              תשלומי שיראל
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${filtered.length} תשלומים${search.trim() && filtered.length !== records.length ? ` מתוך ${records.length}` : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<Payment>
              rows={filtered}
              columns={PAYMENT_EXPORT_COLUMNS}
              title="תשלומי שיראל"
              fileBase="payments"
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
              + הוסף תשלום
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {records.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <div style={{
              backgroundColor: C.card, borderRadius: 14,
              border: `1px solid ${C.accentRim}`,
              boxShadow: `0 2px 10px rgba(13,148,136,0.08)`,
              padding: '20px 22px',
              borderTop: `2px solid ${C.accent}`,
            }}>
              <p style={{
                fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 10px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                שולם
              </p>
              <p style={{
                fontSize: 32, fontWeight: 700, margin: 0, lineHeight: 1,
                color: C.accent,
              }}>
                ₪{totalPaid.toLocaleString('he-IL')}
              </p>
            </div>
            <div style={{
              backgroundColor: C.card, borderRadius: 14,
              border: `1px solid #FDE68A`,
              boxShadow: `0 2px 10px rgba(245,158,11,0.08)`,
              padding: '20px 22px',
              borderTop: `2px solid #F59E0B`,
            }}>
              <p style={{
                fontSize: 11, fontWeight: 600, color: '#92400E', margin: '0 0 10px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                טרם שולם
              </p>
              <p style={{
                fontSize: 32, fontWeight: 700, margin: 0, lineHeight: 1,
                color: '#F59E0B',
              }}>
                ₪{totalUnpaid.toLocaleString('he-IL')}
              </p>
            </div>
          </div>
        )}

        {/* Free-text search */}
        {!loading && records.length > 0 && (
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="חיפוש חופשי — חודש, סכום, רכזת, סטטוס..."
          />
        )}

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : filtered.length === 0 ? (
          <SearchEmpty query={search} onClear={() => setSearch('')} />
        ) : (
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow,
            overflow: 'hidden',
          }}>
            {filtered.map((r, i) => {
              const paidSt = PAID_STATUS[String(r.is_paid)] ?? PAID_STATUS.false;
              const emailSt = EMAIL_STATUS[r.email_status] ?? EMAIL_STATUS.not_sent;
              const dateD = paymentDisplayDate(r);
              return (
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
                  {/* Date badge — full Gregorian date + Hebrew date underneath */}
                  <div style={{
                    minWidth: 96, textAlign: 'center', flexShrink: 0,
                    backgroundColor: '#F6F8FB', border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: '8px 8px',
                  }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>
                      {dateD.greg}
                    </p>
                    {dateD.hebrew && (
                      <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', lineHeight: 1.2 }}>
                        {dateD.hebrew}
                      </p>
                    )}
                  </div>

                  {/* Amount + details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                      ₪{Number(r.amount).toLocaleString('he-IL')}
                    </p>
                    <p style={{ fontSize: 12, color: C.muted, margin: '3px 0 0' }}>
                      {r.payment_method ? (paymentMethodLabels[r.payment_method] ?? r.payment_method) : '—'}
                      {r.received_date && ` · ${r.received_date}`}
                      {(r.coordinator as any)?.full_name && ` · ${(r.coordinator as any).full_name}`}
                    </p>
                    {r.notes && (
                      <p style={{
                        fontSize: 12, color: C.sub, margin: '3px 0 0',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {r.notes}
                      </p>
                    )}
                  </div>

                  {/* Payment status */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    backgroundColor: paidSt.bg, color: paidSt.text, border: `1px solid ${paidSt.border}`,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: paidSt.dot, display: 'inline-block' }} />
                    {paidSt.label}
                  </span>

                  {/* Email status */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 500,
                    backgroundColor: emailSt.bg, color: emailSt.text, border: `1px solid ${emailSt.border}`,
                    flexShrink: 0,
                  }}>
                    {emailSt.label}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                    <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                    <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                  </div>
                </div>
              );
            })}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: C.muted,
              backgroundColor: '#F8FAFC', borderTop: `1px solid #F1F5F9`,
            }}>
              {filtered.length} תשלומים
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת תשלום' : 'הוספת תשלום'}>
        <PaymentForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
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
            <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '20%', marginBottom: 8 }} />
            <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '35%' }} />
          </div>
          <div style={{ height: 22, width: 80, backgroundColor: '#F1F5F9', borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין תשלומים עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת התשלום הראשון</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף תשלום
      </button>
    </div>
  );
}
