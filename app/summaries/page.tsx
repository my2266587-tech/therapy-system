'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import SummaryForm from '@/components/summaries/SummaryForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import type { SessionSummary } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

/* ── Recording widget ── */
type RecState = 'idle' | 'recording' | 'done';

function RecordingWidget() {
  const [state,    setState]    = useState<RecState>('idle');
  const [seconds,  setSeconds]  = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mrRef      = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mrRef.current   = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
        setState('done');
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(100);
      setState('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      alert('לא ניתן לגשת למיקרופון. אנא אשרי גישה בהגדרות הדפדפן.');
    }
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mrRef.current?.stop();
  }

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setState('idle');
    setSeconds(0);
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      padding: '18px 24px', marginBottom: 24, direction: 'rtl',
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.muted,
        margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        הקלטת פגישה
      </p>

      {state === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={start}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '11px 22px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
              boxShadow: `0 2px 8px rgba(13,148,136,0.22)`, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <MicIcon />
            התחל הקלטה
          </button>
          <span style={{ fontSize: 13, color: C.muted }}>לחצי להתחיל הקלטת הפגישה</span>
        </div>
      )}

      {state === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              backgroundColor: '#EF4444', animation: 'recPulse 1.5s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>מקליט</span>
          </div>
          <span style={{
            fontVariantNumeric: 'tabular-nums', fontSize: 24, fontWeight: 700,
            color: C.text, letterSpacing: '0.04em',
          }}>
            {fmt(seconds)}
          </span>
          <button
            onClick={stop}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              backgroundColor: '#FEF2F2', color: '#DC2626',
              border: '1.5px solid #FECACA', borderRadius: 10,
              padding: '10px 20px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#FEE2E2'; el.style.borderColor = '#FCA5A5';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#FEF2F2'; el.style.borderColor = '#FECACA';
            }}
          >
            <StopIcon />
            עצור הקלטה
          </button>
        </div>
      )}

      {state === 'done' && audioUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16, color: C.accent }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
              הקלטה הסתיימה · {fmt(seconds)}
            </span>
          </div>
          <audio controls src={audioUrl} style={{ height: 34, flex: 1, minWidth: 200 }} />
          <button
            onClick={reset}
            style={{
              fontSize: 12, fontWeight: 500, color: C.sub, background: 'none',
              border: `1px solid ${C.border}`, borderRadius: 7,
              padding: '6px 14px', cursor: 'pointer',
            }}
          >
            הקלטה חדשה
          </button>
        </div>
      )}

      <style>{`
        @keyframes recPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50%      { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}

/* ── Main page ── */

export default function SummariesPage() {
  const [records, setRecords] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<SessionSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('session_summaries')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    setRecords((data ?? []) as SessionSummary[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק סיכום זה?')) return;
    await supabase.from('session_summaries').delete().eq('id', id);
    load();
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              סיכומי פגישות
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${records.length} סיכומים`}
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
            + הוסף סיכום
          </button>
        </div>

        {/* Recording widget */}
        <RecordingWidget />

        {/* Summaries */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {records.map(r => (
              <div
                key={r.id}
                onClick={() => { setEditing(r); setOpen(true); }}
                style={{
                  backgroundColor: C.card, borderRadius: 12,
                  border: `1px solid ${C.border}`, boxShadow: C.shadow,
                  padding: '18px 20px', cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = C.accentRim;
                  e.currentTarget.style.boxShadow = `0 4px 12px rgba(13,148,136,0.08)`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.boxShadow = C.shadow;
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
                      {(r.patient as any)?.full_name ?? '—'}
                    </p>
                    <p style={{ fontSize: 12, color: C.muted, margin: '3px 0 0' }}>
                      {r.date}
                      {r.start_time && ` · ${r.start_time} – ${r.end_time}`}
                      {r.duration_minutes && ` · ${r.duration_minutes} דק'`}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                    <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                  </div>
                </div>

                {/* Content sections */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {r.main_topics && (
                    <div style={{
                      borderRadius: 8, padding: '12px', backgroundColor: '#F8FAFC',
                      border: `1px solid ${C.border}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                        נושאים
                      </div>
                      <p style={{ fontSize: 13, color: C.sub, margin: 0, lineHeight: 1.5 }}>
                        {r.main_topics.slice(0, 80)}{r.main_topics.length > 80 ? '…' : ''}
                      </p>
                    </div>
                  )}
                  {r.treatment_actions && (
                    <div style={{
                      borderRadius: 8, padding: '12px', backgroundColor: '#F8FAFC',
                      border: `1px solid ${C.border}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                        מה עשינו
                      </div>
                      <p style={{ fontSize: 13, color: C.sub, margin: 0, lineHeight: 1.5 }}>
                        {r.treatment_actions.slice(0, 80)}{r.treatment_actions.length > 80 ? '…' : ''}
                      </p>
                    </div>
                  )}
                  {r.progress && (
                    <div style={{
                      borderRadius: 8, padding: '12px', backgroundColor: '#F8FAFC',
                      border: `1px solid ${C.border}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                        התקדמות
                      </div>
                      <p style={{ fontSize: 13, color: C.sub, margin: 0, lineHeight: 1.5 }}>
                        {r.progress.slice(0, 80)}{r.progress.length > 80 ? '…' : ''}
                      </p>
                    </div>
                  )}
                  {r.next_steps && (
                    <div style={{
                      borderRadius: 8, padding: '12px', backgroundColor: '#F8FAFC',
                      border: `1px solid ${C.border}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                        צעדים הבאים
                      </div>
                      <p style={{ fontSize: 13, color: C.sub, margin: 0, lineHeight: 1.5 }}>
                        {r.next_steps.slice(0, 80)}{r.next_steps.length > 80 ? '…' : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת סיכום' : 'הוספת סיכום'} size="xl">
        <SummaryForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{
          backgroundColor: C.card, borderRadius: 12,
          border: `1px solid ${C.border}`, padding: '18px 20px',
        }}>
          <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '30%', marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[1,2,3,4].map(j => (
              <div key={j} style={{
                borderRadius: 8, padding: '12px', backgroundColor: '#F8FAFC',
              }}>
                <div style={{ height: 10, backgroundColor: '#E8ECF0', borderRadius: 4, width: '40%', marginBottom: 6 }} />
                <div style={{ height: 30, backgroundColor: '#F1F5F9', borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין סיכומים עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת הסיכום הראשון</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף סיכום
      </button>
    </div>
  );
}
