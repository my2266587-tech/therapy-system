'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import PatientForm from '@/components/patients/PatientForm';
import { patientStatusLabels, housingTypeLabels } from '@/lib/labels';
import type { Patient } from '@/types';

export default function PatientsPage() {
  const [records, setRecords] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('patients')
      .select('*, coordinator:coordinator_id(full_name), staff_member:staff_id(full_name)')
      .order('full_name');
    setRecords((data ?? []) as Patient[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק את המטופלת? פעולה זו אינה ניתנת לביטול.')) return;
    await supabase.from('patients').delete().eq('id', id);
    load();
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader title="מטופלות" description="ניהול רשימת המטופלות במערכת"
        buttonLabel="הוסף מטופלת" onAdd={() => { setEditing(null); setOpen(true); }} />

      {loading ? (
        <p className="text-center py-12 text-slate-400">טוען...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center text-slate-400">
          לא נמצאו מטופלות. לחצי על <strong className="text-slate-600">הוסף מטופלת</strong> להוספה ראשונה.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['שם מטופלת','טלפון','סטטוס','רכזת','סוג דירה','פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${r.id}`} className="font-medium text-teal-700 hover:underline">{r.full_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.phone ?? '-'}</td>
                  <td className="px-4 py-3"><Badge value={r.status} labels={patientStatusLabels} /></td>
                  <td className="px-4 py-3 text-slate-600">{(r.coordinator as any)?.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.housing_type ? (housingTypeLabels[r.housing_type] ?? r.housing_type) : '-'}</td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת מטופלת' : 'הוספת מטופלת'} size="xl">
        <PatientForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
