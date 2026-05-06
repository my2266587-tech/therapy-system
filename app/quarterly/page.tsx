'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import QuarterlyForm from '@/components/quarterly/QuarterlyForm';
import type { QuarterlySummary } from '@/types';

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
    if (!s) return '—';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <PageHeader
        title="סיכום רבעון"
        description="סקירות תקופתיות למטופלות"
        buttonLabel="הוסף סיכום רבעון"
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
                {['מטופלת', 'תאריך', 'פגישה עם', 'סיכום', 'משך', 'פעולות'].map(h => (
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
                  <td className="px-4 py-3.5 font-semibold" style={{ color: '#0F172A' }}>
                    {(r.patient as any)?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#475569' }}>{r.date}</td>
                  <td className="px-4 py-3.5" style={{ color: '#475569' }}>{r.participants ?? '—'}</td>
                  <td className="px-4 py-3.5 max-w-xs" style={{ color: '#64748B' }}>
                    {truncate(r.summary)}
                  </td>
                  <td className="px-4 py-3.5" style={{ color: '#64748B' }}>
                    {r.duration_minutes ? `${r.duration_minutes} דק'` : '—'}
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
          <div className="px-4 py-3 text-xs" style={{ color: '#94A3B8', borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
            {records.length} סיכומים
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת סיכום רבעון' : 'הוספת סיכום רבעון'}>
        <QuarterlyForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
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
      <p className="font-semibold mb-1" style={{ color: '#0F172A' }}>אין סיכומי רבעון עדיין</p>
      <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>לחצי להוספת הרשומה הראשונה</p>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0F766E' }}>+ הוסף סיכום</button>
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
