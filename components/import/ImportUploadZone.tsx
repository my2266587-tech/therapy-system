'use client';

import { useRef, useState, type DragEvent } from 'react';

interface Props {
  busy?: boolean;
  onFile: (file: File) => void;
}

const C = {
  card: '#FFFFFF', border: '#E8ECF0', text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4', bg: '#F8FAFC',
};

export default function ImportUploadZone({ busy, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (busy) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      style={{
        borderRadius: 14, padding: '40px 24px', textAlign: 'center',
        backgroundColor: dragOver ? C.accentSub : C.bg,
        border: `2px dashed ${dragOver ? C.accentRim : '#CBD5E1'}`,
        cursor: busy ? 'wait' : 'pointer',
        transition: 'all 0.15s',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 13, margin: '0 auto 14px',
        backgroundColor: C.card, border: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.accent,
      }}>
        <UploadIcon size={22} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 5px' }}>
        {busy ? 'מעבד את הקובץ...' : 'גררי קובץ לכאן או לחצי לבחירה'}
      </p>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
        Excel (.xlsx) · CSV · עד 5MB
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    </div>
  );
}

function UploadIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
