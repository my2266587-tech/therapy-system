'use client';

import { useState } from 'react';
import type { WorkTimeEntry } from '@/types';
import { hoursMinutesToSeconds, formatDuration } from '@/lib/hourBank';

const C = {
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#0F172A', sub: '#64748B', muted: '#94A3B8', border: '#E2E8F0',
  danger: '#DC2626', dangerRim: '#FECACA', dangerSub: '#FEF2F2',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 14,
  backgroundColor: '#FFFFFF', color: C.text, width: '100%', outline: 'none', fontFamily: 'inherit',
};

/* ── Shared hours+minutes input ── */
function HMFields({
  hours, minutes, onHours, onMinutes,
}: {
  hours: string; minutes: string; onHours: (v: string) => void; onMinutes: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>שעות</label>
        <input type="number" min={0} step={1} value={hours}
          onChange={e => onHours(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>דקות</label>
        <input type="number" min={0} max={59} step={1} value={minutes}
          onChange={e => onMinutes(e.target.value)} style={inputStyle} />
      </div>
    </div>
  );
}

/* ── Radio pill group ── */
function RadioPills<T extends string>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(o => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              textAlign: 'right', padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${on ? C.accentRim : C.border}`,
              backgroundColor: on ? C.accentSub : '#FFFFFF',
              transition: 'all 0.12s',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: on ? C.accent : C.text }}>{o.label}</div>
            {o.hint && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{o.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Footer buttons ── */
function Footer({
  submitLabel, onCancel, busy, danger,
}: {
  submitLabel: string; onCancel: () => void; busy?: boolean; danger?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-start' }}>
      <button type="submit" disabled={busy} style={{
        backgroundColor: danger ? C.danger : C.accent, color: '#FFFFFF', border: 'none',
        borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600,
        cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
      }}>
        {busy ? '...' : submitLabel}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} style={{
        backgroundColor: 'transparent', color: C.sub, border: `1px solid ${C.border}`,
        borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>
        ביטול
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Reload form                                                                */
/* ════════════════════════════════════════════════════════════════════════ */
export function ReloadForm({
  onSave, onCancel, busy,
}: {
  onSave: (seconds: number, mode: 'add' | 'reset') => void; onCancel: () => void; busy?: boolean;
}) {
  const [hours, setHours] = useState('5');
  const [minutes, setMinutes] = useState('0');
  const [mode, setMode] = useState<'add' | 'reset'>('add');

  const seconds = hoursMinutesToSeconds(Number(hours), Number(minutes));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (seconds <= 0) return;
    onSave(seconds, mode);
  }

  return (
    <form onSubmit={submit} style={{ direction: 'rtl' }}>
      <div style={{ marginBottom: 18 }}>
        <HMFields hours={hours} minutes={minutes} onHours={setHours} onMinutes={setMinutes} />
      </div>
      <RadioPills
        value={mode}
        onChange={setMode}
        options={[
          { value: 'add', label: 'הוספה ליתרה הקיימת', hint: 'השעות יתווספו למה שכבר נותר בבנק.' },
          { value: 'reset', label: 'איפוס והתחלת מכסה חדשה', hint: 'הניצול מתאפס והמכסה נקבעת לכמות שהוזנה.' },
        ]}
      />
      {seconds > 0 && (
        <p style={{ fontSize: 13, color: C.sub, margin: '14px 0 0' }}>
          סה״כ להטענה: <strong>{formatDuration(seconds)}</strong>
        </p>
      )}
      <Footer submitLabel="הטען" onCancel={onCancel} busy={busy} />
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Manual adjust form                                                         */
/* ════════════════════════════════════════════════════════════════════════ */
export function AdjustForm({
  onSave, onCancel, busy,
}: {
  onSave: (seconds: number, direction: 'add' | 'subtract', note: string) => void;
  onCancel: () => void; busy?: boolean;
}) {
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('30');
  const [note, setNote] = useState('');

  const seconds = hoursMinutesToSeconds(Number(hours), Number(minutes));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (seconds <= 0) return;
    onSave(seconds, direction, note.trim());
  }

  return (
    <form onSubmit={submit} style={{ direction: 'rtl' }}>
      <div style={{ marginBottom: 18 }}>
        <RadioPills
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'add', label: 'הוספת זמן', hint: 'הוספת שעות ליתרה (למשל תיקון).' },
            { value: 'subtract', label: 'הפחתת זמן', hint: 'הפחתת שעות מהיתרה.' },
          ]}
        />
      </div>
      <div style={{ marginBottom: 18 }}>
        <HMFields hours={hours} minutes={minutes} onHours={setHours} onMinutes={setMinutes} />
      </div>
      <div>
        <label style={labelStyle}>הערה (אופציונלי)</label>
        <input value={note} onChange={e => setNote(e.target.value)} style={inputStyle}
          placeholder="סיבת התיקון" />
      </div>
      {seconds > 0 && (
        <p style={{ fontSize: 13, color: C.sub, margin: '14px 0 0' }}>
          {direction === 'add' ? 'יתווספו' : 'יופחתו'}: <strong>{formatDuration(seconds)}</strong>
        </p>
      )}
      <Footer submitLabel="שמור תיקון" onCancel={onCancel} busy={busy} />
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Edit work entry form                                                       */
/* ════════════════════════════════════════════════════════════════════════ */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EntryForm({
  entry, onSave, onDelete, onCancel, busy,
}: {
  entry: WorkTimeEntry;
  onSave: (startedAt: string, endedAt: string, note: string) => void;
  onDelete: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [start, setStart] = useState(toLocalInput(entry.started_at));
  const [end, setEnd] = useState(toLocalInput(entry.ended_at));
  const [note, setNote] = useState(entry.note ?? '');

  const startIso = fromLocalInput(start);
  const endIso = fromLocalInput(end);
  const durationSeconds =
    startIso && endIso ? Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000)) : 0;
  const invalid = !startIso || !endIso || Date.parse(endIso) < Date.parse(startIso);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid || !startIso || !endIso) return;
    onSave(startIso, endIso, note.trim());
  }

  return (
    <form onSubmit={submit} style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>שעת התחלה</label>
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>שעת סיום</label>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div style={{ marginBottom: 4 }}>
        <label style={labelStyle}>הערה — מה בוצע (אופציונלי)</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          style={{ ...inputStyle, resize: 'none' }} />
      </div>

      <p style={{ fontSize: 13, color: invalid ? C.danger : C.sub, margin: '12px 0 0' }}>
        {invalid ? 'טווח הזמנים לא תקין.' : <>משך מעודכן: <strong>{formatDuration(durationSeconds)}</strong></>}
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={busy || invalid} style={{
            backgroundColor: C.accent, color: '#FFFFFF', border: 'none', borderRadius: 9,
            padding: '10px 22px', fontSize: 14, fontWeight: 600,
            cursor: busy || invalid ? 'not-allowed' : 'pointer', opacity: busy || invalid ? 0.6 : 1,
          }}>
            {busy ? '...' : 'שמור שינויים'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} style={{
            backgroundColor: 'transparent', color: C.sub, border: `1px solid ${C.border}`,
            borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            ביטול
          </button>
        </div>
        <button type="button" onClick={onDelete} disabled={busy} style={{
          backgroundColor: C.dangerSub, color: C.danger, border: `1px solid ${C.dangerRim}`,
          borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          מחק רשומה
        </button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Stop-timer note capture                                                    */
/* ════════════════════════════════════════════════════════════════════════ */
export function StopForm({
  initialNote, elapsedLabel, onSave, onCancel, busy,
}: {
  initialNote: string; elapsedLabel: string;
  onSave: (note: string) => void; onCancel: () => void; busy?: boolean;
}) {
  const [note, setNote] = useState(initialNote);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave(note.trim());
  }

  return (
    <form onSubmit={submit} style={{ direction: 'rtl' }}>
      <p style={{ fontSize: 14, color: C.sub, margin: '0 0 16px' }}>
        משך העבודה שנמדד: <strong style={{ color: C.text }}>{elapsedLabel}</strong>. הזמן יירד מהבנק.
      </p>
      <div>
        <label style={labelStyle}>הערה — מה בוצע (אופציונלי)</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus
          style={{ ...inputStyle, resize: 'none' }} placeholder="תיאור קצר של העבודה שבוצעה" />
      </div>
      <Footer submitLabel="עצור ושמור" onCancel={onCancel} busy={busy} danger />
    </form>
  );
}
