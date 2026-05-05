'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  patientId: string;
  onSave: () => void;
  onCancel: () => void;
}

type RecState = 'idle' | 'recording' | 'recorded' | 'saving';

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function RecordingModal({ patientId, onSave, onCancel }: Props) {
  const [recState,  setRecState]  = useState<RecState>('idle');
  const [seconds,   setSeconds]   = useState(0);
  const [audioUrl,  setAudioUrl]  = useState<string | null>(null);
  const [error,     setError]     = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const blobRef     = useRef<Blob | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // cleanup on unmount
  useEffect(() => () => {
    clearTimer();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // pick best supported format
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', '']
        .find(t => !t || MediaRecorder.isTypeSupported(t)) ?? '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = mr;

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        setRecState('recorded');
        stream.getTracks().forEach(t => t.stop());
      };

      mr.start(250);
      setSeconds(0);
      setRecState('recording');
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setError('לא ניתן לגשת למיקרופון — אנא אשרי הרשאת מיקרופון בדפדפן.');
    }
  }

  function stopRecording() {
    clearTimer();
    recorderRef.current?.stop();
  }

  function reset() {
    clearTimer();
    recorderRef.current?.stop();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    blobRef.current = null;
    setSeconds(0);
    setRecState('idle');
    setError('');
  }

  async function saveRecording() {
    if (!blobRef.current) return;
    setRecState('saving');
    setError('');
    try {
      const ts       = Date.now();
      const ext      = blobRef.current.type.includes('ogg') ? 'ogg' : 'webm';
      const filePath = `recordings/${patientId}/${ts}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('recordings')
        .upload(filePath, blobRef.current, { contentType: blobRef.current.type, upsert: false });

      if (upErr) throw upErr;

      // Store the storage path, not a public URL — signed URLs are generated on display
      const { error: dbErr } = await supabase.from('recordings').insert({
        patient_id:  patientId,
        recorded_at: new Date(ts).toISOString(),
        audio_url:   filePath,
        status:      'pending',
      });

      if (dbErr) throw dbErr;
      onSave();
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'שגיאה בשמירת ההקלטה');
      setRecState('recorded');
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* ── Idle ─────────────────────────────────────────────── */}
      {recState === 'idle' && (
        <div className="flex flex-col items-center gap-4 py-10">
          <button
            onClick={startRecording}
            className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-lg flex items-center justify-center">
            <span className="text-3xl">🎙️</span>
          </button>
          <p className="text-sm text-slate-400">לחצי להתחלת הקלטה</p>
        </div>
      )}

      {/* ── Recording ────────────────────────────────────────── */}
      {recState === 'recording' && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
            <div className="relative w-24 h-24 rounded-full bg-red-500 flex items-center justify-center">
              <div className="w-6 h-6 rounded-sm bg-white" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-slate-700 tabular-nums">{fmt(seconds)}</div>
          <p className="text-sm text-red-500 font-medium">מקליט...</p>
          <button
            onClick={stopRecording}
            className="mt-2 px-7 py-2.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-colors">
            עצור הקלטה
          </button>
        </div>
      )}

      {/* ── Recorded ─────────────────────────────────────────── */}
      {recState === 'recorded' && audioUrl && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>תצוגה מקדימה</span>
              <span className="font-mono">{fmt(seconds)}</span>
            </div>
            <audio src={audioUrl} controls className="w-full h-10" />
          </div>
          <div className="flex gap-3">
            <button
              onClick={saveRecording}
              className="flex-1 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-xl transition-colors">
              שמור הקלטה
            </button>
            <button
              onClick={reset}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
              הקלט מחדש
            </button>
          </div>
        </div>
      )}

      {/* ── Saving ───────────────────────────────────────────── */}
      {recState === 'saving' && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-700 rounded-full animate-spin" />
          <p className="text-sm text-slate-400">מעלה ושומר הקלטה...</p>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      {recState !== 'saving' && (
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600 transition-colors px-2 py-1">
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
