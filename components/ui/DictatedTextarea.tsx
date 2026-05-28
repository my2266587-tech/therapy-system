'use client';

/**
 * A textarea with a built-in microphone button that dictates Hebrew
 * speech into the field via the browser's Web Speech API.
 *
 *   - One click → start listening. Mic turns red and pulses.
 *   - Speak — each finalized phrase is appended to the field (with a
 *     leading space so continued dictation reads naturally).
 *   - Click again → stop. Or click another field's mic — the previous
 *     one stops itself (we broadcast a custom event so only one
 *     recognition is active at a time, matching how browsers want
 *     microphone access to work anyway).
 *
 * Append-not-replace: the user can mix typing and dictation freely;
 * the recognizer never wipes existing text. Interim (still-being-said)
 * text shows above the textarea as a subtle hint until it's finalized.
 *
 * Browser support: Chrome / Edge / Safari (via webkitSpeechRecognition).
 * Firefox has no implementation today — the mic button is hidden in
 * that case and a small note explains why. The textarea itself remains
 * fully functional for typed input.
 */

import { useEffect, useId, useRef, useState } from 'react';

/* ── Minimal types for the Web Speech API (TS lib.dom doesn't ship them yet) ── */
interface SRAlternative { transcript: string; confidence: number }
interface SRResult { 0: SRAlternative; isFinal: boolean; length: number }
interface SRResultList { length: number; item(i: number): SRResult; [i: number]: SRResult }
interface SREvent extends Event { resultIndex: number; results: SRResultList }
interface SRErrorEvent extends Event { error: string; message?: string }
interface SRInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((this: SRInstance, ev: SREvent) => void) | null;
  onerror:  ((this: SRInstance, ev: SRErrorEvent) => void) | null;
  onend:    ((this: SRInstance, ev: Event) => void) | null;
}
interface SRConstructor { new (): SRInstance }

function getSpeechRecognition(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?:       SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Stop-everyone-else event. Each instance dispatches this on start
 * with its own id so all OTHER instances can stop their recognizers.
 * Cheap, no global state needed.
 */
const STOP_OTHERS = 'dictation:stop-others';

interface StopOthersDetail { exceptId: string }

const fieldBase: React.CSSProperties = {
  border:          '1px solid #E2E8F0',
  borderRadius:    8,
  padding:         '9px 12px',
  fontSize:        14,
  backgroundColor: '#FFFFFF',
  color:           '#0F172A',
  width:           '100%',
  outline:         'none',
  transition:      'border-color 0.12s, box-shadow 0.12s',
  fontFamily:      'inherit',
};

const labelStyle: React.CSSProperties = {
  display:       'block',
  fontSize:      12,
  fontWeight:    600,
  color:         '#374151',
  marginBottom:  6,
  letterSpacing: '0.01em',
};

interface Props {
  label?:       string;
  value:        string;
  onChange:     (v: string) => void;
  rows?:        number;
  placeholder?: string;
  /** ISO-639 language tag for recognition. Default 'he-IL'. */
  lang?:        string;
}

export default function DictatedTextarea({
  label, value, onChange, rows = 3, placeholder, lang = 'he-IL',
}: Props) {
  const instanceId = useId();
  const [recording, setRecording] = useState(false);
  const [interim,   setInterim]   = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(true);

  const recRef     = useRef<SRInstance | null>(null);
  // Cache the latest `value` + `onChange` for the recognition callbacks
  // because the recognizer is created once and its closures would
  // otherwise see stale React state.
  const valueRef    = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Detect API support on mount (client-only).
  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
  }, []);

  // Listen for "another field started" events so we stop our own
  // recognizer and there's never more than one mic active at a time.
  useEffect(() => {
    function onStopOthers(e: Event) {
      const detail = (e as CustomEvent<StopOthersDetail>).detail;
      if (detail.exceptId !== instanceId && recRef.current) {
        try { recRef.current.stop(); } catch { /* already stopped */ }
      }
    }
    window.addEventListener(STOP_OTHERS, onStopOthers);
    return () => window.removeEventListener(STOP_OTHERS, onStopOthers);
  }, [instanceId]);

  // Cleanup on unmount.
  useEffect(() => () => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* noop */ }
      recRef.current = null;
    }
  }, []);

  function start() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    // Broadcast so any other field stops dictating.
    window.dispatchEvent(new CustomEvent<StopOthersDetail>(STOP_OTHERS, {
      detail: { exceptId: instanceId },
    }));

    setError(null);
    setInterim('');

    const rec = new Ctor();
    rec.lang           = lang;
    rec.continuous     = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      let finalsToAppend = '';
      let interimText    = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const txt = r[0]?.transcript ?? '';
        if (r.isFinal) finalsToAppend += txt;
        else           interimText    += txt;
      }
      if (finalsToAppend.trim()) {
        const prev = valueRef.current ?? '';
        // Add a separating space when continuing a phrase.
        const sep = prev && !/\s$/.test(prev) ? ' ' : '';
        onChangeRef.current(prev + sep + finalsToAppend.trim());
      }
      setInterim(interimText);
    };

    rec.onerror = (ev) => {
      const code = ev.error;
      // 'no-speech' fires after a stretch of silence — not really an
      // error, just an automatic stop. Suppress the banner.
      if (code === 'no-speech' || code === 'aborted') return;
      const map: Record<string, string> = {
        'not-allowed':        'הדפדפן חוסם גישה למיקרופון. אשרי גישה בהגדרות.',
        'service-not-allowed': 'הדפדפן חוסם גישה לשירות הזיהוי.',
        'network':            'אין חיבור לרשת — זיהוי הדיבור משתמש בשירות בענן.',
        'audio-capture':      'לא נמצא מיקרופון.',
      };
      setError(map[code] ?? `שגיאת זיהוי: ${code}`);
    };

    rec.onend = () => {
      // Recognition can end on its own (e.g. silence + continuous=true
      // can still time out in some browsers). Sync UI back to idle.
      setRecording(false);
      setInterim('');
      recRef.current = null;
    };

    try {
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (e) {
      setError(`לא הצלחתי להתחיל הקלטה: ${(e as Error).message}`);
    }
  }

  function stop() {
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* noop */ }
    }
  }

  function toggle() {
    if (recording) stop();
    else           start();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {label && <label style={labelStyle}>{label}</label>}

      <div style={{ position: 'relative' }}>
        <textarea
          value={value}
          onChange={e => onChangeRef.current(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          style={{
            ...fieldBase,
            resize: 'none',
            // Leave room for the mic button at the start (RTL → right side).
            paddingInlineStart: supported ? 44 : 12,
          }}
          onFocus={e => {
            e.target.style.borderColor = '#0F766E';
            e.target.style.boxShadow = '0 0 0 3px rgba(15,118,110,0.10)';
          }}
          onBlur={e => {
            e.target.style.borderColor = '#E2E8F0';
            e.target.style.boxShadow = '';
          }}
        />

        {supported && (
          <button
            type="button"
            onClick={toggle}
            aria-label={recording ? 'עצור הכתבה' : 'התחל הכתבה'}
            title={recording ? 'עצור הכתבה' : 'הכתב לטקסט (קליק)'}
            style={{
              position: 'absolute', top: 6, insetInlineStart: 6,
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${recording ? '#FECACA' : '#E2E8F0'}`,
              backgroundColor: recording ? '#FEF2F2' : '#F8FAFC',
              color: recording ? '#DC2626' : '#475569',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.12s',
              animation: recording ? 'dictPulse 1.5s ease-in-out infinite' : undefined,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              if (!recording) {
                el.style.borderColor = '#99F6E4';
                el.style.color = '#0D9488';
              }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              if (!recording) {
                el.style.borderColor = '#E2E8F0';
                el.style.color = '#475569';
              }
            }}
          >
            <MicIcon />
          </button>
        )}
      </div>

      {/* Interim text — what the recognizer is hearing right now,
          shown subtly so the user has live feedback without committing. */}
      {recording && interim && (
        <div style={{
          marginTop: 5, padding: '4px 10px', borderRadius: 6,
          backgroundColor: '#F0FDF9', color: '#0F766E',
          fontSize: 12, lineHeight: 1.4,
          border: '1px dashed #99F6E4',
        }}>
          {interim}
        </div>
      )}

      {recording && !interim && (
        <p style={{ marginTop: 5, fontSize: 11, color: '#0D9488' }}>
          🎙 מקשיב... דברי כעת.
        </p>
      )}

      {error && (
        <p style={{ marginTop: 5, fontSize: 11, color: '#DC2626' }}>
          {error}
        </p>
      )}

      {!supported && (
        <p style={{ marginTop: 5, fontSize: 11, color: '#94A3B8' }}>
          הכתבה בקול לא נתמכת בדפדפן הזה. נסי ב-Chrome / Edge.
        </p>
      )}

      <style>{`
        @keyframes dictPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
