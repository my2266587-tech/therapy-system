'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import QuarterlyForm from '@/components/quarterly/QuarterlyForm';
import type { QuarterlySummary } from '@/types';
import { fmtDate } from '@/lib/dateUtils';

export default function QuarterlyPage() {
  const [records, setRecords] = useState<QuarterlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<QuarterlySummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('quarterly_summaries')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    setRecords((data ?? []) as QuarterlySummary[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק סיכום רבעון זה?')) return;
    await supabase.from('quarterly_summaries').delete().eq('id', id);
    load();
  }

  function truncate(s: string | null, n = 60) {
    if (!s) return '-';
    return s.length > n ? s.slice(0, n) + '...' : s;
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader title="סיכום רבעון" description="סקירות תקופתיות למטופלות"
        buttonLabel="הוסף סיכום רבעון" onAdd={() => { setEditing(null); setOpen(true); }} />

      {loading ? (
        <p className="text-center py-12 text-slate-400">טוען...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center text-slate-400">
          לא נמצאו סיכומי רבעון.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['מטופלת','תאריך','פגישה עם','סיכום','משך','פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{(r.patient as any)?.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.participants ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs">{truncate(r.summary)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.duration_minutes ? `${r.duration_minutes} דק'` : '-'}</td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת סיכום רבעון' : 'הוספת סיכום רבעון'}>
        <QuarterlyForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
