'use client';

import { useEffect, useRef, useState } from 'react';
import {
  exportToExcel, exportToPdf, type Column, type ExportOptions,
} from '@/lib/exportTable';

interface Props<T> extends ExportOptions<T> {
  /** Disable the button (e.g. while page is still loading). */
  disabled?: boolean;
}

export default function ExportButton<T>({
  rows, columns, title, fileBase, disabled,
}: Props<T>) {
  const [open, setOpen]       = useState(false);
  const [busy, setBusy]       = useState<'excel' | 'pdf' | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Auto-clear errors
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const noRows = rows.length === 0;
  const isDisabled = !!disabled || noRows || !!busy;

  const run = async (kind: 'excel' | 'pdf') => {
    setOpen(false);
    setBusy(kind);
    setError(null);
    try {
      const opts: ExportOptions<T> = { rows, columns, title, fileBase };
      if (kind === 'excel') await exportToExcel(opts);
      else                  await exportToPdf(opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`שגיאה בייצוא: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => !isDisabled && setOpen(o => !o)}
        disabled={isDisabled}
        title={noRows ? 'אין נתונים לייצוא' : 'הורדת הטבלה'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E8ECF0',
          color: isDisabled ? '#94A3B8' : '#475569',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.12s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          opacity: busy ? 0.7 : 1,
        }}
        onMouseEnter={e => {
          if (isDisabled) return;
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = '#F0FDF9';
          el.style.borderColor = '#99F6E4';
          el.style.color = '#0D9488';
        }}
        onMouseLeave={e => {
          if (isDisabled) return;
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = '#FFFFFF';
          el.style.borderColor = '#E8ECF0';
          el.style.color = '#475569';
        }}
      >
        <DownloadIcon size={14} />
        {busy === 'excel' ? 'מייצא Excel...' :
         busy === 'pdf'   ? 'מייצא PDF...'   :
         'הורדה'}
        <ChevronIcon size={11} open={open} />
      </button>

      {open && !isDisabled && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', insetInlineEnd: 0,
            minWidth: 180, padding: 4, zIndex: 50,
            backgroundColor: '#FFFFFF', borderRadius: 10,
            border: '1px solid #E8ECF0',
            boxShadow: '0 8px 24px rgba(15,23,42,0.10)',
          }}
        >
          <MenuItem
            label="הורד Excel"
            sub=".xlsx · עברית · auto-width"
            color="#16A34A"
            icon={<ExcelIcon />}
            onClick={() => run('excel')}
          />
          <MenuItem
            label="הורד PDF"
            sub=".pdf · RTL · עם ספירת עמודים"
            color="#DC2626"
            icon={<PdfIcon />}
            onClick={() => run('pdf')}
          />
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', insetInlineEnd: 0,
          minWidth: 220, padding: '8px 12px', zIndex: 50,
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 8, color: '#DC2626', fontSize: 12,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label, sub, color, icon, onClick,
}: {
  label: string; sub: string; color: string;
  icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '8px 10px', borderRadius: 7,
        backgroundColor: 'transparent', border: 'none',
        cursor: 'pointer', textAlign: 'right',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, flexShrink: 0,
        borderRadius: 6, color, backgroundColor: `${color}14`,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1A2332' }}>
          {label}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function ChevronIcon({ size = 11, open }: { size?: number; open: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function ExcelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8"  y1="13" x2="16" y2="13"/>
      <line x1="8"  y1="17" x2="16" y2="17"/>
      <line x1="10" y1="9"  x2="14" y2="9"/>
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <text x="7" y="18" fontSize="6" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
    </svg>
  );
}

/* Re-export Column type so callers don't need a second import */
export type { Column } from '@/lib/exportTable';
