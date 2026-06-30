'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Per-question voice answer recorder.
 *
 * Records a single audio clip via the browser MediaRecorder API and hands the
 * resulting Blob back to the parent via onChange. The parent uploads the blob
 * at submit time. Playback + re-record are supported. There is NO transcription
 * — the brief says store + play only, and the app has no per-recording
 * transcription infrastructure (the existing one is Yemot-phone specific).
 */
export default function AudioRecorder({
  onChange,
}: {
  onChange: (blob: Blob | null) => void;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl]     = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<BlobPart[]>([]);
  const streamRef   = useRef<MediaStream | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef      = useRef<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined';

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, []);

  useEffect(() => {
    // Cleanup on unmount.
    return () => { stopTimer(); releaseStream(); revokeUrl(); };
  }, [stopTimer, releaseStream, revokeUrl]);

  const start = useCallback(async () => {
    setError(null);
    if (!supported) { setError('הדפדפן אינו תומך בהקלטה'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        revokeUrl();
        const u = URL.createObjectURL(blob);
        urlRef.current = u;
        setUrl(u);
        onChange(blob);
        setState('recorded');
        releaseStream();
      };
      recorderRef.current = mr;
      mr.start();
      setState('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setError('לא ניתן לגשת למיקרופון. בדקי הרשאות.');
      releaseStream();
    }
  }, [supported, onChange, releaseStream, revokeUrl]);

  const stop = useCallback(() => {
    stopTimer();
    recorderRef.current?.stop();
  }, [stopTimer]);

  const reset = useCallback(() => {
    revokeUrl();
    setUrl(null);
    setSeconds(0);
    setState('idle');
    onChange(null);
  }, [onChange, revokeUrl]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (!supported) {
    return (
      <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
        הקלטה אינה נתמכת בדפדפן זה
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {state === 'idle' && (
        <button type="button" onClick={start} style={btn('#0D9488', '#F0FDF9', '#99F6E4')}>
          <MicIcon /> הקלטת תשובה
        </button>
      )}

      {state === 'recording' && (
        <button type="button" onClick={stop} style={btn('#DC2626', '#FEF2F2', '#FECACA')}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', backgroundColor: '#DC2626',
            display: 'inline-block', animation: 'pulse 1s ease-in-out infinite',
          }} />
          עצרי הקלטה · {fmt(seconds)}
        </button>
      )}

      {state === 'recorded' && url && (
        <>
          <audio src={url} controls style={{ height: 32, maxWidth: 220 }} />
          <button type="button" onClick={reset} style={btn('#64748B', '#F8FAFC', '#E8ECF0')}>
            הקלטה מחדש
          </button>
        </>
      )}

      {error && <span style={{ fontSize: 11.5, color: '#DC2626' }}>{error}</span>}
    </div>
  );
}

function btn(color: string, bg: string, border: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    color, backgroundColor: bg, border: `1px solid ${border}`, cursor: 'pointer',
  };
}

function MicIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}
