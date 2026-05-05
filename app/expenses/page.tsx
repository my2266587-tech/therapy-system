'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import type { PrivateExpense } from '@/types';
import { fmtDate } from '@/lib/dateUtils';

export default function ExpensesPage() {
  const [records, setRecords] = useState<PrivateExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<PrivateExpense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('private_expenses')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    setRecords((data ?? []) as PrivateExpense[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק הוצאה זו?')) return;
    await supabase.from('private_expenses').delete().eq('id', id);
    load();
  }

  const total = records.reduce((s, r) => s + Number(r.cost), 0);

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader title="הוצאות פרטיות" description="מעקב הוצאות לפי מטופלת"
        buttonLabel="הוסף הוצאה" onAdd={() => { setEditing(null); setOpen(true); }} />

      {records.length > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6 text-sm text-teal-800">
          סה"כ הוצאות: <strong>₪{total.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</strong>
        </div>
      )}

      {loading ? (
        <p className="text-center py-12 text-slate-400">טוען...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center text-slate-400">
          לא נמצאו הוצאות.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['מטופלת','תאריך','סוג טיפול','חומרים','פירוט','עלות','פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{(r.patient as any)?.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.treatment_type}</td>
                  <td className="px-4 py-3 text-slate-500">{r.materials ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.details ?? '-'}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">₪{Number(r.cost).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => { setEditing(r); setOpen(true); }} className="text-teal-700 hover:underline text-xs font-medium">ערוך</button>
                      <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:underline text-xs font-medium">מחק</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת הוצאה' : 'הוספת הוצאה'}>
        <ExpenseForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
