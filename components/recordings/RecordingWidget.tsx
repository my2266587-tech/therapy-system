'use client';

/**
 * In-browser recording widget for the recordings module.
 *
 * Captures audio via MediaRecorder, asks the clinician which patient the
 * recording is for, then uploads to /api/recordings on save. The server
 * stores the audio in the private `recordings` bucket and inserts a row
 * with status='pending' / processing_status='queued'.
 *
 * No transcription is performed yet — that's the next step in the pipeline
 * (Whisper). For now the row sits ready for a worker to pick up.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const C = {
  card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
  danger:    '#DC2626',
  dangerBg:  '#FEF2F2',
  dangerRim: '#FECACA',
  rec:       '#EF4444',
  ok:        '#16A34A',
  okBg:      '#F0FDF4',
  okRim:     '#BBF7D0',
};

type RecState =
  | 'idle'        // ready to record
  | 'recording'   // mic active, timer running
  | 'done'        // captured locally, waiting for save
  | 'uploading'   // POST /api/recordings in flight
  | 'saved'       // server confirmed; UI shows success
  | 'error';      // upload failed; user can retry

interface PatientOption { id: string; full_name: string }

interface Props {
  /** Called after a successful upload + DB insert so the parent can refresh
   *  its list. Argument is the new recording id (in case the parent wants
   *  to highlight it). */
  onSaved?: (recordingId: string) => void;
  title?: string;
}

export default function RecordingWidget({ onSaved, title }: Props) {
  const [state,    setState]    = useState<RecState>('idle');
  const [seconds,  setSeconds]  = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blob,     setBlob]     = useState<Blob | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [patients,    setPatients]    = useState<PatientOption[]>([]);
  const [patientId,   setPatientId]   = useState<string>('');
  const [savedRecordingId, setSavedRecordingId] = useState<string | null>(null);

  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── load active patients for the picker ──────────────────────── */
  useEffect(() => {
    supabase
      .from('patients')
      .select('id, full_name, status')
      .neq('status', 'inactive')
      .order('full_name')
      .then(({ data }) => {
        setPatients((data ?? []) as PatientOption[]);
      });
  }, []);

  /* ── cleanup ──────────────────────────────────────────────────── */
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function start() {
    setError(null);
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
      setError('לא ניתן לגשת למיקרופון. אנא אשרי גישה בהגדרות הדפדפן.');
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
    setError(null);
    setSavedRecordingId(null);
    // keep patientId — user might record several for the same patient
  }

  async function save() {
    if (!blob || !patientId) return;
    setState('uploading');
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('יש להתחבר מחדש');
        setState('error');
        return;
      }

      const fd = new FormData();
      fd.append('file', blob, `recording-${Date.now()}.webm`);
      fd.append('patient_id', patientId);
      fd.append('duration_seconds', String(seconds));
      fd.append('recorded_at', new Date().toISOString());

      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בשמירת ההקלטה');
        setState('error');
        return;
      }

      setSavedRecordingId(json.id);
      setState('saved');
      if (onSaved) onSaved(json.id);
    } catch (e) {
      setError(`שגיאת רשת: ${(e as Error).message}`);
      setState('error');
    }
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const isRecording = state === 'recording';
  const isUploading = state === 'uploading';
  const isSaved     = state === 'saved';
  const showActions = state === 'done' || state === 'error';

  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      padding: '18px 24px', direction: 'rtl',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, gap: 10, flexWrap: 'wrap',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 600, color: C.muted,
          margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {title ?? 'הקלטה מהירה'}
        </p>

        {/* Patient picker — locked while recording so the metadata
            can't drift mid-session. */}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: C.sub,
        }}>
          <span style={{ flexShrink: 0 }}>מטופלת:</span>
          <select
            value={patientId}
            onChange={e => setPatientId(e.target.value)}
            disabled={isRecording || isUploading}
            style={{
              minWidth: 180, padding: '6px 10px', borderRadius: 8,
              border: `1px solid ${patientId ? C.accentRim : C.border}`,
              backgroundColor: patientId ? C.accentSub : C.card,
              color: patientId ? C.accent : C.sub,
              fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
              cursor: (isRecording || isUploading) ? 'not-allowed' : 'pointer',
              outline: 'none',
            }}
          >
            <option value="">— בחרי מטופלת —</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Idle */}
      {state === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            onClick={start}
            disabled={!patientId}
            title={!patientId ? 'יש לבחור מטופלת לפני שמתחילים להקליט' : ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              backgroundColor: patientId ? C.accent : C.border,
              color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '11px 22px', fontSize: 14,
              fontWeight: 600, cursor: patientId ? 'pointer' : 'not-allowed',
              boxShadow: patientId ? '0 2px 8px rgba(13,148,136,0.22)' : 'none',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { if (patientId) (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { if (patientId) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <MicIcon />
            התחל הקלטה
          </button>
          <span style={{ fontSize: 13, color: C.muted }}>
            {patientId
              ? 'לחצי להתחיל. ההקלטה תישמר אוטומטית בסיום.'
              : 'בחרי מטופלת מהרשימה כדי להתחיל.'}
          </span>
        </div>
      )}

      {/* Recording */}
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

      {/* Done / error — preview + save */}
      {showActions && audioUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16, color: C.accent }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
              הקלטה הסתיימה · {fmt(seconds)}
            </span>
          </div>
          <audio controls src={audioUrl} style={{ height: 34, flex: '1 1 240px', minWidth: 200 }} />
          <button
            onClick={save}
            disabled={!patientId}
            title={!patientId ? 'יש לבחור מטופלת' : ''}
            style={{
              fontSize: 13, fontWeight: 600, color: '#FFFFFF',
              backgroundColor: patientId ? C.accent : C.border, border: 'none',
              borderRadius: 8, padding: '8px 16px',
              cursor: patientId ? 'pointer' : 'not-allowed',
              boxShadow: patientId ? '0 2px 6px rgba(13,148,136,0.18)' : 'none',
            }}
          >
            {state === 'error' ? 'נסי שוב ←' : 'שמור במערכת ←'}
          </button>
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

      {/* Uploading */}
      {isUploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: `2px solid ${C.accentRim}`, borderTopColor: C.accent,
            animation: 'spin 0.7s linear infinite', display: 'inline-block',
          }} />
          <span style={{ fontSize: 13, color: C.sub }}>מעלה את ההקלטה למערכת...</span>
        </div>
      )}

      {/* Saved */}
      {isSaved && savedRecordingId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: 10,
          backgroundColor: C.okBg, border: `1px solid ${C.okRim}`,
        }}>
          <span style={{ fontSize: 16, color: C.ok }}>✓</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ok }}>
            ההקלטה נשמרה · ממתינה לתמלול
          </span>
          <button
            onClick={reset}
            style={{
              fontSize: 12, fontWeight: 600, color: C.accent, background: '#FFFFFF',
              border: `1px solid ${C.accentRim}`, borderRadius: 7,
              padding: '6px 14px', cursor: 'pointer', marginInlineStart: 'auto',
            }}
          >
            הקלטה חדשה
          </button>
        </div>
      )}

      {error && state !== 'uploading' && state !== 'saved' && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 10,
          backgroundColor: C.dangerBg, border: `1px solid ${C.dangerRim}`,
          color: C.danger, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <style>{`
        @keyframes recPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50%      { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
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
