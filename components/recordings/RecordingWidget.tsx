'use client';

/**
 * In-browser recording widget for the recordings module.
 *
 * Captures audio via MediaRecorder, shows a live timer, and surfaces the
 * blob to the parent via `onRecorded(blob, durationSeconds)`. The widget
 * itself does NOT upload to Supabase Storage or insert a recordings row —
 * that's the next phase. For now the parent decides what to do with the
 * blob (download, preview, attach to a manual form, etc.).
 *
 * The stop button releases the microphone tracks; the reset button revokes
 * the previously-issued blob URL so memory doesn't leak across re-records.
 */

import { useEffect, useRef, useState } from 'react';

const C = {
  card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
  danger:    '#DC2626',
  dangerBg:  '#FEF2F2',
  dangerRim: '#FECACA',
  rec:       '#EF4444',
};

type RecState = 'idle' | 'recording' | 'done';

interface Props {
  /** Called when the user finishes a recording. The parent gets the audio
   *  blob and the elapsed seconds — what to do next is its choice. */
  onRecorded?: (blob: Blob, durationSeconds: number) => void;
  /** Optional override for the panel title. */
  title?: string;
}

export default function RecordingWidget({ onRecorded, title }: Props) {
  const [state,    setState]    = useState<RecState>('idle');
  const [seconds,  setSeconds]  = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blob,     setBlob]     = useState<Blob | null>(null);
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
        const recordedBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setBlob(recordedBlob);
        setAudioUrl(URL.createObjectURL(recordedBlob));
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
    setBlob(null);
    setState('idle');
    setSeconds(0);
  }

  function emit() {
    if (blob && onRecorded) onRecorded(blob, seconds);
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      padding: '18px 24px', direction: 'rtl',
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.muted,
        margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {title ?? 'הקלטה מהירה'}
      </p>

      {state === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            onClick={start}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
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
          <span style={{ fontSize: 13, color: C.muted }}>
            לחצי להתחיל הקלטת פגישה. ההקלטה תישמר במכשיר עד שתבחרי לשמור אותה במערכת.
          </span>
        </div>
      )}

      {state === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              backgroundColor: C.rec, animation: 'recPulse 1.5s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.rec }}>מקליט</span>
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
              backgroundColor: C.dangerBg, color: C.danger,
              border: `1.5px solid ${C.dangerRim}`, borderRadius: 10,
              padding: '10px 20px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#FEE2E2'; el.style.borderColor = '#FCA5A5';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = C.dangerBg; el.style.borderColor = C.dangerRim;
            }}
          >
            <StopIcon />
            עצור הקלטה
          </button>
        </div>
      )}

      {state === 'done' && audioUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16, color: C.accent }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
              הקלטה הסתיימה · {fmt(seconds)}
            </span>
          </div>
          <audio controls src={audioUrl} style={{ height: 34, flex: '1 1 240px', minWidth: 200 }} />
          {onRecorded && (
            <button
              onClick={emit}
              style={{
                fontSize: 13, fontWeight: 600, color: '#FFFFFF',
                backgroundColor: C.accent, border: 'none', borderRadius: 8,
                padding: '8px 16px', cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(13,148,136,0.18)',
              }}
            >
              שמירה במערכת ←
            </button>
          )}
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

/* ── Icons ─────────────────────────────────────────────────────────── */

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
