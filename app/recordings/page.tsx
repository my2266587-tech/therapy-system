'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import RecordingForm from '@/components/recordings/RecordingForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import type { Recording } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const RECORDING_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  pending:      { label: 'ממתין לתמלול', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
  transcribed:  { label: 'תומלל',        bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  draft_ready:  { label: 'סיכום מוכן',   bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE', dot: '#4F46E5' },
  approved:     { label: 'אושר',         bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
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
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              הקלטות ותמלולים
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${records.length} הקלטות`}
            </p>
          </div>
          <button
            onClick={() => { setEditing(null); setOpen(true); }}
            style={{
              backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '10px 20px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
              boxShadow: `0 2px 8px rgba(13,148,136,0.22)`, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            + הוסף הקלטה
          </button>
        </div>

        {/* Info banner */}
        <div style={{
          backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: 12, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14, color: '#1E40AF', flexShrink: 0 }}>ℹ</span>
          <p style={{ fontSize: 13, color: '#1E40AF', margin: 0 }}>
            הקלטה זוהתמלול — הקלטות ממתינות יהפכו לסיכומי פגישות אוטומטית.
          </p>
        </div>

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow,
            overflow: 'hidden',
          }}>
            {records.map((r, i) => {
              const st = RECORDING_STATUS[r.status] ?? RECORDING_STATUS.pending;
              return (
                <div
                  key={r.id}
                  onClick={() => { setEditing(r); setOpen(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 18,
                    padding: '16px 24px', cursor: 'pointer',
                    borderBottom: i < records.length - 1 ? `1px solid #F1F5F9` : 'none',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                >
                  {/* Recording icon */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.accent, fontSize: 18,
                  }}>
                    🎙
                  </div>

                  {/* Patient name + date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                      {(r.patient as any)?.full_name ?? '—'}
                    </p>
                    <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
                      {new Date(r.recorded_at).toLocaleDateString('he-IL')}
                      {r.created_at && ` · ${new Date(r.recorded_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>

                  {/* Transcript & draft status */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>תמלול</div>
                      <span style={{
                        width: 20, height: 20, borderRadius: 6,
                        backgroundColor: r.transcript ? '#F0FDF9' : '#F8FAFC',
                        border: `1px solid ${r.transcript ? '#99F6E4' : C.border}`,
                        color: r.transcript ? C.accent : C.muted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {r.transcript ? '✓' : '—'}
                      </span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>סיכום</div>
                      <span style={{
                        width: 20, height: 20, borderRadius: 6,
                        backgroundColor: r.draft_summary ? '#EEF2FF' : '#F8FAFC',
                        border: `1px solid ${r.draft_summary ? '#C7D2FE' : C.border}`,
                        color: r.draft_summary ? '#4F46E5' : C.muted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {r.draft_summary ? '✓' : '—'}
                      </span>
                    </div>
                  </div>

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
                    <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                    <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                  </div>
                </div>
              );
            })}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: C.muted,
              backgroundColor: '#F8FAFC', borderTop: `1px solid #F1F5F9`,
            }}>
              {records.length} הקלטות
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת הקלטה' : 'הוספת הקלטה'}>
        <RecordingForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {[1,2,3,4,5].map((i, idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 24px', borderBottom: idx < 4 ? `1px solid #F1F5F9` : 'none' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '25%', marginBottom: 8 }} />
            <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '18%' }} />
          </div>
          <div style={{ height: 22, width: 80, backgroundColor: '#F1F5F9', borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין הקלטות עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת ההקלטה הראשונה</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף הקלטה
      </button>
    </div>
  );
}
