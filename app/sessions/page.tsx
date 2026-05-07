'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import SessionForm from '@/components/sessions/SessionForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import type { Session } from '@/types';

const SESSION_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  planned:   { label: 'מתוכננת',  bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  completed: { label: 'הושלמה',   bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
  cancelled: { label: 'בוטלה',    bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', dot: '#DC2626' },
  no_show:   { label: 'לא הגיעה', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
};

function formatDate(dateStr: string) {
  const today = new Date().toISOString().slice(0, 10);
  const tom   = new Date(); tom.setDate(tom.getDate() + 1);
  if (dateStr === today)                      return 'היום';
  if (dateStr === tom.toISOString().slice(0, 10)) return 'מחר';
  return new Date(dateStr).toLocaleDateString('he-IL', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function SessionsPage() {
  const [records, setRecords] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sessions')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    setRecords((data ?? []) as Session[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק פגישה זו?')) return;
    await supabase.from('sessions').delete().eq('id', id);
    load();
  }

  return (
    <div style={{ backgroundColor: '#F6F8FB', minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A2332', margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              יומן פגישות
            </h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {loading ? '' : `${records.length} פגישות`}
            </p>
          </div>
          <AddBtn onClick={() => { setEditing(null); setOpen(true); }} label="+ הוסף פגישה" />
        </div>

        {loading ? <ListSkeleton /> : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: 16,
            border: '1px solid #E8ECF0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            {records.map((r, i) => {
              const st = SESSION_STATUS[r.status] ?? SESSION_STATUS.planned;
              return (
                <div
                  key={r.id}
                  onClick={() => { setEditing(r); setOpen(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 24px', cursor: 'pointer',
                    borderBottom: i < records.length - 1 ? '1px solid #F1F5F9' : 'none',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                >
                  {/* Date badge */}
                  <div style={{
                    minWidth: 54, textAlign: 'center', flexShrink: 0,
                    backgroundColor: '#F6F8FB', border: '1px solid #E8ECF0',
                    borderRadius: 10, padding: '7px 6px',
                  }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#1A2332', margin: 0, lineHeight: 1 }}>
                      {new Date(r.date).getDate()}
                    </p>
                    <p style={{ fontSize: 10, color: '#94A3B8', margin: '2px 0 0', textTransform: 'uppercase' }}>
                      {new Date(r.date).toLocaleDateString('he-IL', { month: 'short' })}
                    </p>
                  </div>

                  {/* Patient + time */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A2332', margin: 0, lineHeight: 1.3 }}>
                      {(r.patient as any)?.full_name ?? '—'}
                    </p>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>
                      {r.start_time} – {r.end_time}
                      {r.duration_minutes ? ` · ${r.duration_minutes} דק'` : ''}
                    </p>
                  </div>

                  {/* Day label */}
                  <span style={{ fontSize: 12, color: '#64748B', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {formatDate(r.date)}
                  </span>

                  {/* Status */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: st.dot, display: 'inline-block' }} />
                    {st.label}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                    <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor="#0D9488" title="ערוך" />
                    <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                  </div>
                </div>
              );
            })}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: '#94A3B8',
              backgroundColor: '#F8FAFC', borderTop: '1px solid #F1F5F9',
            }}>
              {records.length} פגישות
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת פגישה' : 'הוספת פגישה'}>
        <SessionForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
      borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600,
      cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.22)', transition: 'opacity 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >{label}</button>
  );
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
      {[1,2,3,4,5].map((i,idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: idx < 4 ? '1px solid #F1F5F9' : 'none' }}>
          <div style={{ width: 54, height: 46, borderRadius: 10, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, backgroundColor: '#F1F5F9', borderRadius: 6, width: '35%', marginBottom: 7 }} />
            <div style={{ height: 10, backgroundColor: '#F8FAFC', borderRadius: 6, width: '22%' }} />
          </div>
          <div style={{ height: 22, width: 65, backgroundColor: '#F1F5F9', borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1A2332', margin: '0 0 6px' }}>אין פגישות עדיין</p>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 24px' }}>התחילי בהוספת הפגישה הראשונה</p>
      <button onClick={onAdd} style={{ backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        + הוסף פגישה
      </button>
    </div>
  );
}
