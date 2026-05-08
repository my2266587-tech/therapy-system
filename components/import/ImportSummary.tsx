'use client';

import Link from 'next/link';

interface Props {
  inserted:  number;
  skipped:   number;
  errors:    { index: number; message: string }[];
  targetKey: string;
  targetLabel: string;
  onReset:   () => void;
}

const C = {
  card: '#FFFFFF', border: '#E8ECF0', text: '#1A2332',
  sub: '#64748B', muted: '#94A3B8',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
};

const TARGET_PAGE: Record<string, string> = {
  patients: '/patients',
  sessions: '/sessions',
  staff:    '/staff',
  payments: '/payments',
  expenses: '/expenses',
};

export default function ImportSummary({
  inserted, skipped, errors, targetKey, targetLabel, onReset,
}: Props) {
  const hasErrors = errors.length > 0;
  const ok        = !hasErrors && inserted > 0;

  return (
    <div style={{
      backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: '28px 32px', boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
        backgroundColor: ok ? '#F0FDF4' : hasErrors ? '#FEF2F2' : '#FFFBEB',
        border: `1px solid ${ok ? '#BBF7D0' : hasErrors ? '#FECACA' : '#FDE68A'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, color: ok ? '#16A34A' : hasErrors ? '#DC2626' : '#92400E',
      }}>
        {ok ? '✓' : hasErrors ? '!' : '·'}
      </div>

      <p style={{
        textAlign: 'center', fontSize: 18, fontWeight: 700, color: C.text,
        margin: '0 0 6px',
      }}>
        {ok ? 'הייבוא הסתיים בהצלחה' : hasErrors ? 'הייבוא נכשל' : 'אין מה לייבא'}
      </p>
      <p style={{
        textAlign: 'center', fontSize: 13, color: C.muted, margin: '0 0 22px',
      }}>
        יעד: {targetLabel}
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22,
      }}>
        <Stat label="נוספו" value={inserted} highlight />
        <Stat label="דולגו" value={skipped} />
      </div>

      {hasErrors && (
        <div style={{
          padding: '12px 14px', borderRadius: 10, marginBottom: 20,
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#DC2626' }}>
            שגיאות:
          </p>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, color: '#DC2626' }}>
            {errors.slice(0, 5).map((e, i) => (
              <li key={i}>{e.index ? `שורה ${e.index}: ` : ''}{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onReset}
          style={{
            padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            backgroundColor: C.card, color: C.sub,
            border: `1px solid ${C.border}`, cursor: 'pointer',
          }}
        >
          ייבוא נוסף
        </button>
        {TARGET_PAGE[targetKey] && (
          <Link
            href={TARGET_PAGE[targetKey]}
            style={{
              padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              backgroundColor: C.accent, color: '#FFFFFF', textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
            }}
          >
            פתח {targetLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{
      borderRadius: 10, padding: '14px 16px', textAlign: 'center',
      backgroundColor: highlight ? C.accentSub : '#F8FAFC',
      border: `1px solid ${highlight ? C.accentRim : C.border}`,
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 6px',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1,
        color: highlight ? C.accent : C.text,
      }}>
        {value}
      </p>
    </div>
  );
}
