'use client';

/**
 * File-upload counterpart to RecordingWidget.
 *
 *   The clinician picks an existing audio file from disk (typically a
 *   Zoom audio-only export — `.m4a`) and uploads it through the SAME
 *   POST /api/recordings the live recorder uses. Once the row exists
 *   the regular pipeline ("הפק סיכום מהקלטה" → transcribe → AI → draft)
 *   takes over with no special-casing — uploaded files are
 *   indistinguishable from in-browser recordings after this point.
 *
 * Server-side rules (mirrored client-side so errors appear immediately):
 *   - MIME types: see RECORDING_AUDIO_MIME in lib/storage.ts.
 *   - Max size: 100 MB.
 *   - Video files (e.g. raw Zoom .mp4) are NOT accepted — Whisper itself
 *     can ingest video but the bucket is configured audio-only and the
 *     25 MB Whisper limit would kill most Zoom video files anyway. The
 *     error message guides the user to "Audio only" in Zoom's export.
 *
 * Duration is read client-side from the decoded <audio> element so the
 * server doesn't have to crack open the container. Recorded-at defaults
 * to the file's lastModified (a reasonable proxy for "when this session
 * actually happened" when uploading old exports).
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RECORDING_AUDIO_MIME, RECORDING_MAX_BYTES } from '@/lib/storage';

const C = {
  card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
  danger:    '#DC2626',
  dangerBg:  '#FEF2F2',
  dangerRim: '#FECACA',
  ok:        '#16A34A',
  okBg:      '#F0FDF4',
  okRim:     '#BBF7D0',
};

type UploadState =
  | 'idle'        // no file picked
  | 'ready'       // file picked + validated, awaiting Save
  | 'uploading'   // POST /api/recordings in flight
  | 'saved'       // success
  | 'error';

interface PatientOption { id: string; full_name: string }

interface Props {
  onSaved?: (recordingId: string) => void;
  title?: string;
}

const ACCEPT_ATTR = '.m4a,.mp3,.wav,.ogg,.webm,.mp4,audio/*';

export default function RecordingUploadWidget({ onSaved, title }: Props) {
  const [state,    setState]    = useState<UploadState>('idle');
  const [file,     setFile]     = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [recordedAt, setRecordedAt] = useState<string>(''); // YYYY-MM-DDTHH:MM (datetime-local)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState<string>('');
  const [savedRecordingId, setSavedRecordingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── load active patients ─────────────────────────────────────── */
  useEffect(() => {
    supabase
      .from('patients')
      .select('id, full_name, status')
      .neq('status', 'inactive')
      .order('full_name')
      .then(({ data }) => setPatients((data ?? []) as PatientOption[]));
  }, []);

  /* ── cleanup preview URL on unmount / replacement ──────────────── */
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setDuration(null);
    setRecordedAt('');
    setPreviewUrl(null);
    setError(null);
    setSavedRecordingId(null);
    setState('idle');
    if (inputRef.current) inputRef.current.value = '';
    // keep patientId — user may upload several files for the same patient
  }

  function onPick(picked: File | null) {
    if (!picked) return;

    // Client-side validation that mirrors the server.
    if (picked.size === 0) {
      setError('הקובץ ריק');
      setState('error');
      return;
    }
    if (picked.size > RECORDING_MAX_BYTES) {
      setError('הקובץ חורג מהמגבלה של 100MB. אם זה Zoom — ייצאי במצב Audio Only.');
      setState('error');
      return;
    }
    const mime = picked.type || '';
    // Helpful nudge for the most common mistake — picking the .mp4
    // (video) recording instead of the audio-only m4a.
    if (mime.startsWith('video/')) {
      setError('זה קובץ וידאו. ב-Zoom: Settings → Recording → "Record a separate audio file" כדי לייצא .m4a בלבד.');
      setState('error');
      return;
    }
    if (mime && !(RECORDING_AUDIO_MIME as readonly string[]).includes(mime)) {
      setError(`סוג קובץ לא נתמך (${mime}). מותרים: m4a, mp3, wav, ogg, webm.`);
      setState('error');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(picked);
    setFile(picked);
    setPreviewUrl(url);
    setError(null);
    setSavedRecordingId(null);

    // Default recorded_at = file's lastModified, formatted for datetime-local.
    const d = new Date(picked.lastModified || Date.now());
    setRecordedAt(formatForDateTimeLocal(d));

    // Decode duration via a hidden <audio>. Some containers report
    // Infinity / NaN until the file is fully seeked — handle both.
    const probe = document.createElement('audio');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const d2 = probe.duration;
      setDuration(Number.isFinite(d2) && d2 > 0 ? Math.round(d2) : null);
    };
    probe.onerror = () => setDuration(null);

    setState('ready');
  }

  async function save() {
    if (!file || !patientId) return;
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
      fd.append('file', file, file.name);
      fd.append('patient_id', patientId);
      if (duration != null) fd.append('duration_seconds', String(duration));
      const isoRecordedAt = recordedAt
        ? new Date(recordedAt).toISOString()
        : new Date(file.lastModified || Date.now()).toISOString();
      fd.append('recorded_at', isoRecordedAt);

      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בהעלאת הקובץ');
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

  const isUploading = state === 'uploading';
  const isReady     = state === 'ready';
  const isSaved     = state === 'saved';

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
          {title ?? 'העלאת הקלטה קיימת'}
        </p>

        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: C.sub,
        }}>
          <span style={{ flexShrink: 0 }}>מטופלת:</span>
          <select
            value={patientId}
            onChange={e => setPatientId(e.target.value)}
            disabled={isUploading}
            style={{
              minWidth: 180, padding: '6px 10px', borderRadius: 8,
              border: `1px solid ${patientId ? C.accentRim : C.border}`,
              backgroundColor: patientId ? C.accentSub : C.card,
              color: patientId ? C.accent : C.sub,
              fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
              cursor: isUploading ? 'not-allowed' : 'pointer',
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

      {/* Idle — file picker */}
      {state === 'idle' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={e => onPick(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={!patientId}
            title={!patientId ? 'יש לבחור מטופלת לפני העלאה' : ''}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              backgroundColor: patientId ? C.accent : C.border,
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              padding: '11px 22px', fontSize: 14, fontWeight: 600,
              cursor: patientId ? 'pointer' : 'not-allowed',
              boxShadow: patientId ? '0 2px 8px rgba(13,148,136,0.22)' : 'none',
              transition: 'opacity 0.15s',
            }}
          >
            <UploadIcon />
            בחרי קובץ מהמחשב
          </button>
          <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {patientId
              ? 'נתמכים: m4a, mp3, wav, ogg, webm · עד 100MB.'
              : 'בחרי מטופלת מהרשימה כדי להתחיל.'}
          </span>
        </div>
      )}

      {/* Ready / error with file present — preview + save */}
      {(isReady || (state === 'error' && file)) && previewUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            fontSize: 13, color: C.sub,
          }}>
            <FileIcon />
            <span style={{ fontWeight: 600, color: C.text }}>
              {file!.name}
            </span>
            <span style={{ color: C.muted }}>
              {humanSize(file!.size)}
              {duration != null && ' · ' + fmtDuration(duration)}
            </span>
          </div>

          <audio
            controls
            src={previewUrl}
            style={{ width: '100%', height: 36 }}
          />

          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: C.sub,
          }}>
            <span style={{ flexShrink: 0 }}>תאריך הפגישה:</span>
            <input
              type="datetime-local"
              value={recordedAt}
              onChange={e => setRecordedAt(e.target.value)}
              disabled={isUploading}
              style={{
                padding: '6px 10px', borderRadius: 8,
                border: `1px solid ${C.border}`, backgroundColor: C.card,
                color: C.text, fontSize: 13, fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 11, color: C.muted }}>
              ברירת מחדל: זמן עריכת הקובץ
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={save}
              disabled={!patientId || isUploading}
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
              בחירת קובץ אחר
            </button>
          </div>
        </div>
      )}

      {/* Uploading */}
      {isUploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: `2px solid ${C.accentRim}`, borderTopColor: C.accent,
            animation: 'spin 0.7s linear infinite', display: 'inline-block',
          }} />
          <span style={{ fontSize: 13, color: C.sub }}>מעלה את הקובץ למערכת...</span>
        </div>
      )}

      {/* Saved */}
      {isSaved && savedRecordingId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: 10, marginTop: 12,
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
            העלאת קובץ נוסף
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && state !== 'uploading' && state !== 'saved' && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 10,
          backgroundColor: C.dangerBg, border: `1px solid ${C.dangerRim}`,
          color: C.danger, fontSize: 13, lineHeight: 1.5,
        }}>
          {error}
          {!file && (
            <button
              onClick={() => { setError(null); setState('idle'); }}
              style={{
                marginInlineStart: 12, fontSize: 12, color: C.danger,
                background: 'none', border: 'none', cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              נסי שוב
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────── */

function formatForDateTimeLocal(d: Date): string {
  // YYYY-MM-DDTHH:MM — what <input type="datetime-local"> wants.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/* ── Icons ──────────────────────────────────────────────────────────── */

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
