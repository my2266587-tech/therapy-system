'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import StaffForm from '@/components/staff/StaffForm';
import { staffRoleLabels } from '@/lib/labels';
import type { StaffMember } from '@/types';

export default function StaffPage() {
  const [records, setRecords] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('staff').select('*').order('full_name');
    setRecords(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק איש צוות זה?')) return;
    await supabase.from('staff').delete().eq('id', id);
    load();
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader title="אנשי צוות" description="רכזות, מדריכות ומטפלות"
        buttonLabel="הוסף איש צוות" onAdd={() => { setEditing(null); setOpen(true); }} />

      {loading ? (
        <p className="text-center py-12 text-slate-400">טוען...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center text-slate-400">
          לא נמצאו אנשי צוות. לחצי על <strong className="text-slate-600">הוסף איש צוות</strong> להוספה ראשונה.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['שם','תפקיד','טלפון','מייל','הערות','פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{r.full_name}</td>
                  <td className="px-4 py-3"><Badge value={r.role} labels={staffRoleLabels} /></td>
                  <td className="px-4 py-3 text-slate-600">{r.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.email ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.notes ?? '-'}</td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת איש צוות' : 'הוספת איש צוות'}>
        <StaffForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
