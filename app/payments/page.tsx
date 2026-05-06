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
  padding: '0.75rem 1rem',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: '0.6875rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#6b7b6e',
  whiteSpace: 'nowrap',
  backgroundColor: '#faf7f2',
  borderBottom: '1px solid #e5ddd4',
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

  const totalPaid = records.filter(r => r.is_paid).reduce((s, r) => s + Number(r.amount), 0);
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
          <div className="rounded-xl px-5 py-4" style={{ backgroundColor: '#eef6f1', border: '1px solid #a9d5ba' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#1f623e', letterSpacing: '0.06em' }}>שולם</p>
            <p className="text-xl font-bold" style={{ color: '#1a2620' }}>₪{totalPaid.toLocaleString('he-IL')}</p>
          </div>
          <div className="rounded-xl px-5 py-4" style={{ backgroundColor: '#fdf6ec', border: '1px solid #f0d090' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#92600d', letterSpacing: '0.06em' }}>טרם שולם</p>
            <p className="text-xl font-bold" style={{ color: '#1a2620' }}>₪{totalUnpaid.toLocaleString('he-IL')}</p>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div
        className="rounded-xl px-5 py-3.5 mb-6 text-sm flex items-center gap-3"
        style={{ backgroundColor: '#eff5ff', border: '1px solid #b5cef7', color: '#1e4db7' }}
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
          style={{ border: '1px solid #e5ddd4', boxShadow: '0 1px 4px rgba(26,38,32,0.06)' }}
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
                  style={{ borderBottom: i < records.length - 1 ? '1px solid #f0ece5' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#faf7f2')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <td className="px-4 py-3.5 font-semibold" style={{ color: '#1a2620' }}>{r.month}</td>
                  <td className="px-4 py-3.5 font-medium" style={{ color: '#1a2620' }}>
                    ₪{Number(r.amount).toLocaleString('he-IL')}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge value={String(r.is_paid)} labels={paidLabels} />
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>
                    {r.payment_method ? (paymentMethodLabels[r.payment_method] ?? r.payment_method) : '—'}
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>{r.received_date ?? '—'}</td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>
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
          <div className="px-4 py-3 text-xs" style={{ color: '#8fa49a', borderTop: '1px solid #f0ece5', backgroundColor: '#faf7f2' }}>
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
    <div className="bg-white rounded-xl flex items-center justify-center py-20" style={{ border: '1px solid #e5ddd4' }}>
      <div className="text-center">
        <div className="w-8 h-8 rounded-full border-2 mx-auto mb-3 animate-spin" style={{ borderColor: '#1f623e', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#8fa49a' }}>טוען נתונים...</p>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-white rounded-xl p-16 text-center" style={{ border: '1px solid #e5ddd4' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4" style={{ backgroundColor: '#f2ebe0', color: '#c49438' }}>◌</div>
      <p className="font-semibold mb-1" style={{ color: '#1a2620' }}>אין תשלומים עדיין</p>
      <p className="text-sm mb-4" style={{ color: '#8fa49a' }}>לחצי להוספת הרשומה הראשונה</p>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#1f623e' }}>+ הוסף תשלום</button>
    </div>
  );
}

function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-3">
      <button onClick={onEdit} className="text-xs font-medium" style={{ color: '#1f623e' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}>ערוך</button>
      <button onClick={onDelete} className="text-xs font-medium" style={{ color: '#b91c1c' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}>מחק</button>
    </div>
  );
}
