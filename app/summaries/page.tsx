'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import SummaryForm from '@/components/summaries/SummaryForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import DateDisplay from '@/components/ui/DateDisplay';
import type { SessionSummary, Recording } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

interface SummaryWithRel extends SessionSummary {
  patient: { full_name: string } | null;
}

const SUMMARY_EXPORT_COLUMNS: Column<SummaryWithRel>[] = [
  { header: 'תאריך',           accessor: r => r.date, width: 14 },
  { header: 'מטופלת',          accessor: r => r.patient?.full_name ?? '', width: 22 },
  { header: 'התחלה',           accessor: r => r.start_time ?? '', width: 10 },
  { header: 'סיום',            accessor: r => r.end_time ?? '', width: 10 },
  { header: 'משך (דק׳)',       accessor: r => r.duration_minutes ?? '', width: 12 },
  { header: 'נושאים עיקריים', accessor: r => r.main_topics ?? '', width: 30 },
  { header: 'מה נעשה',         accessor: r => r.treatment_actions ?? '', width: 30 },
  { header: 'התקדמות',         accessor: r => r.progress ?? '', width: 22 },
  { header: 'צעדים הבאים',    accessor: r => r.next_steps ?? '', width: 22 },
  { header: 'הערות',           accessor: r => r.notes ?? '', width: 24 },
];

/* ── Recording widget ── */
type RecState = 'idle' | 'recording' | 'done';

function RecordingWidget() {
  const [state,    setState]    = useState<RecState>('idle');
  const [seconds,  setSeconds]  = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mrRef.current = mr;
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
  const [records, setRecords] = useState<SummaryWithRel[]>([]);
  const [recordingsById, setRecordingsById] = useState<Map<string, Recording>>(new Map());
  const [loading,    setLoading]    = useState(true);
  const [open,       setOpen]       = useState(false);
  const [editing,    setEditing]    = useState<SessionSummary | null>(null);
  const [openDetail, setOpenDetail] = useState<SummaryWithRel | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, r] = await Promise.all([
      supabase.from('session_summaries')
        .select('*, patient:patient_id(full_name)')
        .order('date', { ascending: false }),
      supabase.from('recordings').select('id, recorded_at, status, audio_url, transcript'),
    ]);
    setRecords((s.data ?? []) as unknown as SummaryWithRel[]);
    const m = new Map<string, Recording>();
    for (const rec of (r.data ?? []) as Recording[]) m.set(rec.id, rec);
    setRecordingsById(m);
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
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<SummaryWithRel>
              rows={records}
              columns={SUMMARY_EXPORT_COLUMNS}
              title="סיכומי פגישות"
              fileBase="session-summaries"
              disabled={loading}
            />
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
        </div>

        {/* Recording widget */}
        <RecordingWidget />

        {/* Summaries list */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.map(r => {
              const fromRecording = r.session_id ? recordingsById.has(r.session_id) : false;
              const preview = r.main_topics ?? r.treatment_actions ?? r.progress ?? r.notes ?? '';
              return (
                <div
                  key={r.id}
                  onClick={() => setOpenDetail(r)}
                  style={{
                    backgroundColor: C.card, borderRadius: 12,
                    border: `1px solid ${C.border}`, boxShadow: C.shadow,
                    borderRight: `3px solid ${C.accent}`,
                    padding: '14px 18px', cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = C.accentRim;
                    e.currentTarget.style.borderRightColor = C.accent;
                    e.currentTarget.style.boxShadow = `0 4px 12px rgba(13,148,136,0.08)`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = C.border;
                    e.currentTarget.style.borderRightColor = C.accent;
                    e.currentTarget.style.boxShadow = C.shadow;
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Patient + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                          {r.patient?.full_name ?? '—'}
                        </p>
                        {fromRecording && <SourceBadge label="מהקלטה" />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <DateDisplay date={r.date} size="sm" />
                        {r.start_time && (
                          <span style={{
                            fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums',
                            alignSelf: 'center',
                          }}>
                            {r.start_time}{r.end_time ? `–${r.end_time}` : ''}
                            {r.duration_minutes ? ` · ${r.duration_minutes} דק'` : ''}
                          </span>
                        )}
                      </div>
                      {preview && (
                        <p style={{
                          fontSize: 13, color: C.sub, margin: '8px 0 0', lineHeight: 1.5,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {preview}
                        </p>
                      )}
                    </div>

                    {/* Open hint */}
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: C.accent,
                      padding: '2px 8px', borderRadius: 12,
                      backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
                      flexShrink: 0, alignSelf: 'flex-start', marginTop: 2,
                    }}>
                      פתח →
                    </span>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignSelf: 'flex-start' }} onClick={e => e.stopPropagation()}>
                      <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                      <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing?.id ? 'עריכת סיכום' : 'הוספת סיכום'} size="xl">
        <SummaryForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>

      {/* Detail modal */}
      <Modal
        open={openDetail !== null}
        onClose={() => setOpenDetail(null)}
        title="סיכום פגישה"
        size="xl"
      >
        {openDetail && (
          <SummaryDetail
            summary={openDetail}
            recording={openDetail.session_id ? recordingsById.get(openDetail.session_id) : undefined}
            onEdit={() => {
              const s = openDetail;
              setOpenDetail(null);
              setEditing(s);
              setOpen(true);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── Detail view ── */
function SummaryDetail({ summary, recording, onEdit }: {
  summary: SummaryWithRel;
  recording: Recording | undefined;
  onEdit: () => void;
}) {
  const fromRecording = !!recording;

  const sections: { label: string; value: string | null | undefined; tone?: 'accent' }[] = [
    { label: 'נושאים עיקריים',  value: summary.main_topics },
    { label: 'מה עשינו בפגישה', value: summary.treatment_actions },
    { label: 'מצב נוכחי',        value: summary.current_state },
    { label: 'התקדמות',          value: summary.progress, tone: 'accent' },
    { label: 'צעדים הבאים',      value: summary.next_steps },
    { label: 'משימות שניתנו',    value: summary.tasks_given },
    { label: 'קשיים',            value: summary.difficulties },
    { label: 'הערות',            value: summary.notes },
  ];
  const visible = sections.filter(s => s.value && s.value.trim());

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', marginBottom: 18,
        backgroundColor: '#F8FAFC', borderRadius: 10, border: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>
            {summary.patient?.full_name ?? '—'}
          </h3>
          <button
            onClick={onEdit}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: `1px solid ${C.border}`, color: C.sub, backgroundColor: C.card,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = C.accentRim; el.style.color = C.accent;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = C.border; el.style.color = C.sub;
            }}
          >
            ערוך סיכום
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <MetaItem label="תאריך" value={<DateDisplay date={summary.date} size="sm" />} />
          {summary.start_time && (
            <MetaItem label="שעות" value={`${summary.start_time}${summary.end_time ? ` – ${summary.end_time}` : ''}`} />
          )}
          {summary.duration_minutes && (
            <MetaItem label="משך" value={`${summary.duration_minutes} דק'`} />
          )}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              מקור
            </div>
            <div style={{ marginTop: 3 }}>
              {fromRecording ? <SourceBadge label="🎙 נוצר מהקלטה" /> : <SourceBadge label="הוזן ידנית" muted />}
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      {visible.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '20px 0' }}>
          אין תוכן בסיכום זה
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(s => (
            <Section key={s.label} label={s.label} value={s.value!} accent={s.tone === 'accent'} />
          ))}
        </div>
      )}

      {/* Recording attachment */}
      {recording && (
        <div style={{
          marginTop: 16, padding: '14px 16px',
          borderRadius: 10, backgroundColor: '#EEF2FF', border: '1px solid #C7D2FE',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#4F46E5',
            letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8,
          }}>
            הקלטה מקורית
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: C.text }}>
              {new Date(recording.recorded_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {recording.audio_url && (
              <audio controls src={recording.audio_url} style={{ height: 32, flex: 1, minWidth: 200 }} />
            )}
          </div>
        </div>
      )}

      {summary.attachment_url && (
        <div style={{
          marginTop: 12, padding: '12px 14px',
          borderRadius: 10, backgroundColor: '#F8FAFC', border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4,
            }}>
              קובץ מצורף
            </div>
            <a href={summary.attachment_url} target="_blank" rel="noreferrer" style={{
              fontSize: 13, color: C.accent, textDecoration: 'none', fontWeight: 500,
            }}>
              פתח קובץ ←
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      borderRadius: 10, padding: '14px 16px',
      backgroundColor: accent ? '#F0FDF9' : C.card,
      border: `1px solid ${accent ? '#99F6E4' : C.border}`,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: accent ? '#0D9488' : '#94A3B8',
        letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, color: '#1A2332', lineHeight: 1.6, whiteSpace: 'pre-wrap',
      }}>
        {value}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

function SourceBadge({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 16, fontSize: 11, fontWeight: 500,
      backgroundColor: muted ? '#F8FAFC' : '#EEF2FF',
      color:           muted ? '#64748B' : '#4F46E5',
      border: `1px solid ${muted ? '#E2E8F0' : '#C7D2FE'}`,
    }}>
      {label}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{
          backgroundColor: C.card, borderRadius: 12,
          border: `1px solid ${C.border}`, padding: '14px 18px',
          borderRight: `3px solid #F1F5F9`,
        }}>
          <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '25%', marginBottom: 8 }} />
          <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '35%', marginBottom: 10 }} />
          <div style={{ height: 11, backgroundColor: '#F1F5F9', borderRadius: 6, width: '90%', marginBottom: 4 }} />
          <div style={{ height: 11, backgroundColor: '#F1F5F9', borderRadius: 6, width: '70%' }} />
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
