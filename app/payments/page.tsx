'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import PaymentForm, { type SaveMsg } from '@/components/payments/PaymentForm';
import { paymentMethodLabels, emailStatusLabels } from '@/lib/labels';
import type { Payment } from '@/types';
import { fmtDate } from '@/lib/dateUtils';

const paidLabels = { true: 'שולם', false: 'לא שולם' };

const MONTH_NAMES = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

function formatMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-');
  const name = MONTH_NAMES[parseInt(m ?? '1', 10) - 1];
  return name ? `${name} ${y}` : yyyyMm;
}

export default function PaymentsPage() {
  const [records,    setRecords]    = useState<Payment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [open,       setOpen]       = useState(false);
  const [editing,    setEditing]    = useState<Payment | null>(null);
  const [feedback,   setFeedback]   = useState<SaveMsg | null>(null);

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

  function handleSave(msg?: SaveMsg) {
    setOpen(false);
    load();
    setFeedback(msg ?? null);
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader title="תשלומי שיראל" description="מעקב תשלומים חודשיים"
        buttonLabel="הוסף תשלום" onAdd={() => { setEditing(null); setFeedback(null); setOpen(true); }} />

      {/* Feedback banner */}
      {feedback && (
        <div className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
          feedback.ok
            ? 'bg-teal-50 border-teal-200 text-teal-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <span>{feedback.ok ? '✓' : '⚠'} {feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>
      )}

      {loading ? (
        <p className="text-center py-12 text-slate-400">טוען...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center text-slate-400">
          לא נמצאו תשלומים.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['חודש','סכום','סטטוס תשלום','אופן תשלום','תאריך קבלה','רכזת','סטטוס מייל','פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{formatMonth(r.month)}</td>
                  <td className="px-4 py-3 text-slate-600">₪{Number(r.amount).toLocaleString('he-IL')}</td>
                  <td className="px-4 py-3"><Badge value={String(r.is_paid)} labels={paidLabels} /></td>
                  <td className="px-4 py-3 text-slate-600">{r.payment_method ? (paymentMethodLabels[r.payment_method] ?? r.payment_method) : '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.received_date ? fmtDate(r.received_date) : '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{(r.coordinator as { full_name: string } | null)?.full_name ?? '-'}</td>
                  <td className="px-4 py-3"><Badge value={r.email_status} labels={emailStatusLabels} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => { setEditing(r); setFeedback(null); setOpen(true); }}
                        className="text-teal-700 hover:underline text-xs font-medium">ערוך</button>
                      <button onClick={() => handleDelete(r.id)}
                        className="text-red-500 hover:underline text-xs font-medium">מחק</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת תשלום' : 'הוספת תשלום'}>
        <PaymentForm initial={editing} onSave={handleSave} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
