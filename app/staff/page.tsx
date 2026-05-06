'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import StaffForm from '@/components/staff/StaffForm';
import { staffRoleLabels } from '@/lib/labels';
import type { StaffMember } from '@/types';

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
      <PageHeader
        title="אנשי צוות"
        description="רכזות, מדריכות ומטפלות"
        buttonLabel="הוסף איש צוות"
        onAdd={() => { setEditing(null); setOpen(true); }}
      />

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
                {['שם', 'תפקיד', 'טלפון', 'מייל', 'הערות', 'פעולות'].map(h => (
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
                  <td className="px-4 py-3.5 font-semibold" style={{ color: '#1a2620' }}>{r.full_name}</td>
                  <td className="px-4 py-3.5">
                    <Badge value={r.role} labels={staffRoleLabels} />
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>{r.phone ?? '—'}</td>
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>{r.email ?? '—'}</td>
                  <td className="px-4 py-3.5 max-w-xs truncate" style={{ color: '#8fa49a' }}>
                    {r.notes ?? '—'}
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
            {records.length} אנשי צוות
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת איש צוות' : 'הוספת איש צוות'}>
        <StaffForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
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
      <p className="font-semibold mb-1" style={{ color: '#1a2620' }}>אין אנשי צוות עדיין</p>
      <p className="text-sm mb-4" style={{ color: '#8fa49a' }}>לחצי להוספת הרשומה הראשונה</p>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#1f623e' }}>+ הוסף איש צוות</button>
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
