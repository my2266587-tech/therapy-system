'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import type { PrivateExpense } from '@/types';

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
      <PageHeader
        title="הוצאות פרטיות"
        description="מעקב הוצאות לפי מטופלת"
        buttonLabel="הוסף הוצאה"
        onAdd={() => { setEditing(null); setOpen(true); }}
      />

      {records.length > 0 && (
        <div
          className="rounded-xl px-5 py-4 mb-6 flex items-center justify-between"
          style={{ backgroundColor: '#fdf6ec', border: '1px solid #f0d090' }}
        >
          <span className="text-sm" style={{ color: '#92600d' }}>סה"כ הוצאות</span>
          <span className="text-xl font-bold" style={{ color: '#1a2620' }}>
            ₪{total.toLocaleString('he-IL', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

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
                {['מטופלת', 'תאריך', 'סוג טיפול', 'חומרים', 'פירוט', 'עלות', 'פעולות'].map(h => (
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
                  <td className="px-4 py-3.5 font-semibold" style={{ color: '#1a2620' }}>
                    {(r.patient as any)?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>{r.date}</td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>{r.treatment_type}</td>
                  <td className="px-4 py-3.5" style={{ color: '#6b7b6e' }}>{r.materials ?? '—'}</td>
                  <td className="px-4 py-3.5 max-w-xs truncate" style={{ color: '#8fa49a' }}>{r.details ?? '—'}</td>
                  <td className="px-4 py-3.5 font-semibold" style={{ color: '#1a2620' }}>
                    ₪{Number(r.cost).toFixed(2)}
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
            {records.length} הוצאות
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת הוצאה' : 'הוספת הוצאה'}>
        <ExpenseForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
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
      <p className="font-semibold mb-1" style={{ color: '#1a2620' }}>אין הוצאות עדיין</p>
      <p className="text-sm mb-4" style={{ color: '#8fa49a' }}>לחצי להוספת ההוצאה הראשונה</p>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#1f623e' }}>+ הוסף הוצאה</button>
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
