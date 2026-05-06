'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import RecordingForm from '@/components/recordings/RecordingForm';
import { recordingStatusLabels } from '@/lib/labels';
import type { Recording } from '@/types';

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
      <PageHeader
        title="הקלטות ותמלולים"
        description="ניהול הקלטות קוליות וטיוטות סיכום"
        buttonLabel="הוסף רשומה"
        onAdd={() => { setEditing(null); setOpen(true); }}
      />

      {/* Info banner */}
      <div
        className="rounded-xl px-5 py-3.5 mb-6 text-sm flex items-center gap-3"
        style={{ backgroundColor: '#fdf6ec', border: '1px solid #f0d090', color: '#92600d' }}
      >
        <span style={{ color: '#c49438' }}>ℹ</span>
        מנגנון ההקלטה מהדפדפן יחובר בשלב הבא. כרגע ניתן להוסיף ולנהל רשומות ידנית.
      </div>

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
                {['מטופלת', 'תאריך הקלטה', 'תמלול', 'טיוטת סיכום', 'סטטוס', 'פעולות'].map(h => (
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
                  <td className="px-4 py-3.5" style={{ color: '#4a5e52' }}>
                    {new Date(r.recorded_at).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-medium" style={{ color: r.transcript ? '#1f623e' : '#8fa49a' }}>
                      {r.transcript ? 'קיים' : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-medium" style={{ color: r.draft_summary ? '#1f623e' : '#8fa49a' }}>
                      {r.draft_summary ? 'קיים' : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge value={r.status} labels={recordingStatusLabels} />
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
            {records.length} הקלטות
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת הקלטה' : 'הוספת רשומה'}>
        <RecordingForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
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
      <p className="font-semibold mb-1" style={{ color: '#1a2620' }}>אין הקלטות עדיין</p>
      <p className="text-sm mb-4" style={{ color: '#8fa49a' }}>לחצי להוספת הרשומה הראשונה</p>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#1f623e' }}>+ הוסף רשומה</button>
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
