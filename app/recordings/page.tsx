'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import RecordingForm from '@/components/recordings/RecordingForm';
import { recordingStatusLabels } from '@/lib/labels';
import type { Recording } from '@/types';

export default function RecordingsPage() {
  const [records, setRecords] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Recording | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('recordings')
      .select('*, patient:patient_id(full_name)')
      .order('recorded_at', { ascending: false });
    setRecords((data ?? []) as Recording[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק הקלטה זו?')) return;
    await supabase.from('recordings').delete().eq('id', id);
    load();
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader title="הקלטות ותמלולים" description="ניהול הקלטות קוליות וטיוטות סיכום"
        buttonLabel="הוסף רשומה" onAdd={() => { setEditing(null); setOpen(true); }} />

      {loading ? (
        <p className="text-center py-12 text-slate-400">טוען...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center text-slate-400">
          לא נמצאו הקלטות.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['מטופלת','תאריך הקלטה','תמלול','טיוטת סיכום','סטטוס','פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{(r.patient as any)?.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(r.recorded_at).toLocaleDateString('he-IL')}</td>
                  <td className="px-4 py-3 text-slate-500">{r.transcript ? 'קיים' : '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{r.draft_summary ? 'קיים' : '-'}</td>
                  <td className="px-4 py-3"><Badge value={r.status} labels={recordingStatusLabels} /></td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת הקלטה' : 'הוספת רשומה'}>
        <RecordingForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
