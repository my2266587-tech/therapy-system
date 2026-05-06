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

export default function PatientsPage() {
  const [records, setRecords] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [search,  setSearch]  = useState('');

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

  function openAdd()             { setEditing(null); setOpen(true); }
  function openEdit(r: Patient)  { setEditing(r);    setOpen(true); }

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק את המטופלת? פעולה זו אינה ניתנת לביטול.')) return;
    await supabase.from('patients').delete().eq('id', id);
    load();
  }

  const filtered = records.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.phone ?? '').includes(search)
  );

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader
        title="מטופלות"
        description="ניהול רשימת המטופלות במערכת"
        buttonLabel="הוסף מטופלת"
        onAdd={openAdd}
      />

      {/* Search */}
      <div className="mb-5">
        <input
          type="search"
          placeholder="חיפוש לפי שם או טלפון..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            border: '1px solid #e5ddd4',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.875rem',
            fontSize: '0.875rem',
            backgroundColor: '#ffffff',
            color: '#1a2620',
            width: '280px',
            outline: 'none',
          }}
          onFocus={e => {
            e.target.style.borderColor = '#1f623e';
            e.target.style.boxShadow = '0 0 0 3px rgba(31,98,62,0.12)';
          }}
          onBlur={e => {
            e.target.style.borderColor = '#e5ddd4';
            e.target.style.boxShadow = '';
          }}
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={openAdd} hasSearch={search.length > 0} />
      ) : (
        <div
          className="bg-white rounded-xl overflow-x-auto"
          style={{ border: '1px solid #e5ddd4', boxShadow: '0 1px 4px rgba(26,38,32,0.06)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['שם מטופלת', 'טלפון', 'סטטוס', 'רכזת', 'סוג דירה', 'פעולות'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid #f0ece5' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#faf7f2')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/patients/${r.id}`}
                      className="font-semibold hover:underline"
                      style={{ color: '#1f623e' }}
                    >
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>
                    {r.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge value={r.status} labels={patientStatusLabels} />
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>
                    {(r.coordinator as any)?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>
                    {r.housing_type ? (housingTypeLabels[r.housing_type] ?? r.housing_type) : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEdit(r)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#1f623e' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}
                      >
                        ערוך
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: '#b91c1c' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer count */}
          <div
            className="px-4 py-3 text-xs"
            style={{ color: '#8fa49a', borderTop: '1px solid #f0ece5', backgroundColor: '#faf7f2' }}
          >
            {filtered.length} מטופלות{search && ` · תוצאות עבור "${search}"`}
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'עריכת מטופלת' : 'הוספת מטופלת'}
        size="xl"
      >
        <PatientForm
          initial={editing}
          onSave={() => { setOpen(false); load(); }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="bg-white rounded-xl flex items-center justify-center py-20"
      style={{ border: '1px solid #e5ddd4' }}
    >
      <div className="text-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto mb-3 animate-spin"
          style={{ borderColor: '#1f623e', borderTopColor: 'transparent' }}
        />
        <p className="text-sm" style={{ color: '#8fa49a' }}>טוען נתונים...</p>
      </div>
    </div>
  );
}

function EmptyState({ onAdd, hasSearch }: { onAdd: () => void; hasSearch: boolean }) {
  return (
    <div
      className="bg-white rounded-xl p-16 text-center"
      style={{ border: '1px solid #e5ddd4' }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4"
        style={{ backgroundColor: '#f2ebe0', color: '#c49438' }}
      >
        {hasSearch ? '🔍' : '👤'}
      </div>
      {hasSearch ? (
        <p className="text-sm" style={{ color: '#6b7b6e' }}>לא נמצאו תוצאות לחיפוש</p>
      ) : (
        <>
          <p className="font-semibold mb-1" style={{ color: '#1a2620' }}>אין מטופלות עדיין</p>
          <p className="text-sm mb-4" style={{ color: '#8fa49a' }}>התחילי בהוספת המטופלת הראשונה</p>
          <button
            onClick={onAdd}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#1f623e' }}
          >
            + הוסף מטופלת
          </button>
        </>
      )}
    </div>
  );
}
