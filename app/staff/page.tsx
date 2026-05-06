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
  padding: '10px 16px',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#64748B',
  whiteSpace: 'nowrap',
  backgroundColor: '#F8FAFC',
  borderBottom: '1px solid #E2E8F0',
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
          style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
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
                  style={{ borderBottom: i < records.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <td className="px-4 py-3.5 font-semibold" style={{ color: '#0F172A' }}>{r.full_name}</td>
                  <td className="px-4 py-3.5">
                    <Badge value={r.role} labels={staffRoleLabels} />
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#475569' }}>{r.phone ?? '—'}</td>
                  <td className="px-4 py-3.5" style={{ color: '#475569' }}>{r.email ?? '—'}</td>
                  <td className="px-4 py-3.5 max-w-xs truncate" style={{ color: '#94A3B8' }}>
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
          <div
            className="px-4 py-3 text-xs"
            style={{ color: '#94A3B8', borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}
          >
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
    <div className="bg-white rounded-xl flex items-center justify-center py-20" style={{ border: '1px solid #E2E8F0' }}>
      <div className="text-center">
        <div className="w-8 h-8 rounded-full border-2 mx-auto mb-3 animate-spin" style={{ borderColor: '#0F766E', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#94A3B8' }}>טוען נתונים...</p>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-white rounded-xl p-16 text-center" style={{ border: '1px solid #E2E8F0' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4" style={{ backgroundColor: '#F1F5F9', color: '#94A3B8' }}>○</div>
      <p className="font-semibold mb-1" style={{ color: '#0F172A' }}>אין אנשי צוות עדיין</p>
      <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>לחצי להוספת הרשומה הראשונה</p>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0F766E' }}>+ הוסף איש צוות</button>
    </div>
  );
}

function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-3">
      <button onClick={onEdit} className="text-xs font-medium" style={{ color: '#0F766E' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}>ערוך</button>
      <button onClick={onDelete} className="text-xs font-medium" style={{ color: '#DC2626' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = '')}>מחק</button>
    </div>
  );
}
