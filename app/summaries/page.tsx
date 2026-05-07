'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import SummaryForm from '@/components/summaries/SummaryForm';
import type { SessionSummary } from '@/types';

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
      backgroundColor: '#FFFFFF', borderRadius: 14,
      border: '1px solid #E8ECF0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      padding: '18px 24px', marginBottom: 24, direction: 'rtl',
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: '#94A3B8',
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
              backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '11px 22px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(13,148,136,0.22)', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <MicIcon />
            התחל הקלטה
          </button>
          <span style={{ fontSize: 13, color: '#94A3B8' }}>לחצי להתחיל הקלטת הפגישה</span>
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
            color: '#1A2332', letterSpacing: '0.04em',
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
            <span style={{ fontSize: 16, color: '#0D9488' }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0D9488' }}>
              הקלטה הסתיימה · {fmt(seconds)}
            </span>
          </div>
          <audio controls src={audioUrl} style={{ height: 34, flex: 1, minWidth: 200 }} />
          <button
            onClick={reset}
            style={{
              fontSize: 12, fontWeight: 500, color: '#64748B', background: 'none',
              border: '1px solid #E8ECF0', borderRadius: 7,
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
const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'right', fontWeight: 600,
  fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: '#64748B', whiteSpace: 'nowrap',
  backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
};

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

  function truncate(s: string | null, n = 52) {
    if (!s) return '—';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  return (
    <div style={{ backgroundColor: '#F6F8FB', minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A2332', margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              סיכומי פגישות
            </h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {loading ? '' : `${records.length} סיכומים`}
            </p>
          </div>
          <button
            onClick={() => { setEditing(null); setOpen(true); }}
            style={{
              backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '10px 20px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(13,148,136,0.22)', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            + הוסף סיכום
          </button>
        </div>

        {/* Recording widget */}
        <RecordingWidget />

        {/* Summaries table */}
        {loading ? (
          <TableSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: 16,
            border: '1px solid #E8ECF0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['מטופלת', 'תאריך', 'שעות', 'נושאים עיקריים', 'התקדמות', 'פעולות'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: i < records.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <td style={{ padding: '13px 16px', fontWeight: 600, color: '#1A2332' }}>
                      {(r.patient as any)?.full_name ?? '—'}
                    </td>
                    <td style={{ padding: '13px 16px', color: '#475569', whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ padding: '13px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                      {r.start_time ?? '—'} – {r.end_time ?? '—'}
                    </td>
                    <td style={{ padding: '13px 16px', color: '#64748B', maxWidth: 220 }}>
                      {truncate(r.main_topics)}
                    </td>
                    <td style={{ padding: '13px 16px', color: '#64748B', maxWidth: 180 }}>
                      {truncate(r.progress)}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <RowBtn onClick={() => { setEditing(r); setOpen(true); }} label="ערוך" color="#0D9488" />
                        <RowBtn onClick={() => handleDelete(r.id)} label="מחק" color="#DC2626" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{
              padding: '10px 16px', fontSize: 12, color: '#94A3B8',
              borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC',
            }}>
              {records.length} סיכומים
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת סיכום' : 'הוספת סיכום'} size="xl">
        <SummaryForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function RowBtn({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 13px', borderRadius: 7, border: '1px solid #E8ECF0',
        backgroundColor: '#F8FAFC', color: '#64748B',
        fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = color + '55'; el.style.backgroundColor = color + '0A'; el.style.color = color;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = '#E8ECF0'; el.style.backgroundColor = '#F8FAFC'; el.style.color = '#64748B';
      }}
    >
      {label}
    </button>
  );
}

function TableSkeleton() {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
      {[1,2,3,4].map((i, idx) => (
        <div key={i} style={{ display: 'flex', gap: 24, padding: '14px 16px', borderBottom: idx < 3 ? '1px solid #F1F5F9' : 'none' }}>
          {[25,15,18,30,25].map((w, j) => (
            <div key={j} style={{ height: 13, backgroundColor: '#F1F5F9', borderRadius: 6, width: `${w}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0',
      padding: '52px 24px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1A2332', margin: '0 0 6px' }}>אין סיכומים עדיין</p>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 24px' }}>התחילי בהוספת הסיכום הראשון</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף סיכום
      </button>
    </div>
  );
}
