'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import PaymentForm from '@/components/payments/PaymentForm';
import { paymentMethodLabels, emailStatusLabels } from '@/lib/labels';
import type { Payment } from '@/types';

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#64748B',
  whiteSpace: 'nowrap',
  backgroundColor: '#F8FAFC',
  borderBottom: '1px solid #E2E8F0',
};

const paidLabels = { true: 'שולם', false: 'לא שולם' };

export default function PaymentsPage() {
  const [records, setRecords] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payments')
      .select('*, coordinator:coordinator_id(full_name)')
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

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader
        title="תשלומי שיראל"
        description="מעקב תשלומים חודשיים"
        buttonLabel="הוסף תשלום"
        onAdd={() => { setEditing(null); setOpen(true); }}
      />

      {/* Summary banner */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl px-5 py-4" style={{ backgroundColor: '#F0FDFA', border: '1px solid #99F6E4' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#0F766E', letterSpacing: '0.06em' }}>שולם</p>
            <p className="text-xl font-bold" style={{ color: '#0F172A' }}>₪{totalPaid.toLocaleString('he-IL')}</p>
          </div>
          <div className="rounded-xl px-5 py-4" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#92400E', letterSpacing: '0.06em' }}>טרם שולם</p>
            <p className="text-xl font-bold" style={{ color: '#0F172A' }}>₪{totalUnpaid.toLocaleString('he-IL')}</p>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div
        className="rounded-xl px-5 py-3.5 mb-6 text-sm flex items-center gap-3"
        style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF' }}
      >
        <span>ℹ</span>
        שליחת מייל אוטומטי לרכזת תחובר בשלב הבא.
      </div>

      {loading ? (
        <LoadingState />
      ) : records.length === 0 ? (
        <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
      ) : (
        <div
          className="bg-white rounded-xl overflow-x-auto"
          style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['חודש', 'סכום', 'סטטוס תשלום', 'אופן תשלום', 'תאריך קבלה', 'רכזת', 'סטטוס מייל', 'פעולות'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: i < records.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <td className="px-4 py-3.5 font-semibold" style={{ color: '#0F172A' }}>{r.month}</td>
                  <td className="px-4 py-3.5 font-medium" style={{ color: '#0F172A' }}>
                    ₪{Number(r.amount).toLocaleString('he-IL')}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge value={String(r.is_paid)} labels={paidLabels} />
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#475569' }}>
                    {r.payment_method ? (paymentMethodLabels[r.payment_method] ?? r.payment_method) : '—'}
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#475569' }}>{r.received_date ?? '—'}</td>
                  <td className="px-4 py-3.5" style={{ color: '#475569' }}>
                    {(r.coordinator as any)?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge value={r.email_status} labels={emailStatusLabels} />
                  </td>
                  <td className="px-4 py-3.5">
                    <ActionButtons
                      onEdit={() => { setEditing(r); setOpen(true); }}
                      onDelete={() => handleDelete(r.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs" style={{ color: '#94A3B8', borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
            {records.length} תשלומים
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת תשלום' : 'הוספת תשלום'}>
        <PaymentForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="bg-white rounded-xl flex items-center justify-center py-20" style={{ border: '1px solid #E2E8F0' }}>
      <div className="text-center">
        <div className="w-8 h-8 rounded-full border-2 mx-auto mb-3 animate-spin" style={{ borderColor: '#0F766E', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#94A3B8' }}>טוען נתונים...</p>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-white rounded-xl p-16 text-center" style={{ border: '1px solid #E2E8F0' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4" style={{ backgroundColor: '#F1F5F9', color: '#94A3B8' }}>○</div>
      <p className="font-semibold mb-1" style={{ color: '#0F172A' }}>אין תשלומים עדיין</p>
      <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>לחצי להוספת הרשומה הראשונה</p>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0F766E' }}>+ הוסף תשלום</button>
    </div>
  );
}

function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-3">
      <button onClick={onEdit} className="text-xs font-medium" style={{ color: '#0F766E' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}>ערוך</button>
      <button onClick={onDelete} className="text-xs font-medium" style={{ color: '#DC2626' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}>מחק</button>
    </div>
  );
}
