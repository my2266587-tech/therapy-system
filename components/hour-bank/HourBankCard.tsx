'use client';

import type { HourBank } from '@/types';
import {
  remainingSeconds, remainingFraction, isEmpty,
  formatDuration, formatClock, formatDateTime,
} from '@/lib/hourBank';

const C = {
  card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  danger: '#DC2626', dangerSub: '#FEF2F2', dangerRim: '#FECACA',
  track: '#EEF2F6',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

/** Big pill button used for the primary timer actions. */
function ActionButton({
  label, onClick, disabled, variant, busy,
}: {
  label: string; onClick: () => void; disabled?: boolean;
  variant: 'primary' | 'danger' | 'ghost'; busy?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: C.accent, color: '#FFFFFF', border: 'none', boxShadow: '0 2px 8px rgba(13,148,136,0.22)' },
    danger:  { backgroundColor: C.danger, color: '#FFFFFF', border: 'none', boxShadow: '0 2px 8px rgba(220,38,38,0.20)' },
    ghost:   { backgroundColor: 'transparent', color: C.sub, border: `1px solid ${C.border}` },
  };
  const off = disabled || busy;
  return (
    <button
      onClick={onClick}
      disabled={off}
      style={{
        ...styles[variant],
        borderRadius: 10, padding: '11px 22px', fontSize: 14.5, fontWeight: 600,
        cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.5 : 1,
        transition: 'opacity 0.15s', flexShrink: 0,
      }}
      onMouseEnter={e => { if (!off) (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
      onMouseLeave={e => { if (!off) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {busy ? '...' : label}
    </button>
  );
}

export default function HourBankCard({
  bank, elapsed, busy, onStart, onStop, onReload,
}: {
  bank: HourBank;
  /** Live elapsed seconds for the running timer (client-ticked, display only). */
  elapsed: number;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onReload: () => void;
}) {
  const remaining = remainingSeconds(bank);
  const frac = remainingFraction(bank);
  const empty = isEmpty(bank);
  const running = bank.active_started_at != null;

  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 18, border: `1px solid ${C.border}`,
      boxShadow: C.shadow, padding: '26px 28px', marginBottom: 20,
    }}>
      {/* Remaining headline */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 4 }}>נותרו בבנק</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: empty ? C.danger : C.text, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            {formatDuration(Math.max(0, remaining))}
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: C.muted }}>מתוך מכסה של {formatDuration(bank.quota_seconds)}</div>
          {bank.last_loaded_at && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              טעינה אחרונה: {formatDateTime(bank.last_loaded_at)}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar (fills with the REMAINING portion) */}
      <div style={{ marginTop: 16, height: 12, borderRadius: 99, backgroundColor: C.track, overflow: 'hidden' }}>
        <div style={{
          width: `${frac * 100}%`, height: '100%', borderRadius: 99,
          backgroundColor: empty ? C.danger : C.accent,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: C.muted }}>
        <span>נוצלו: {formatDuration(bank.used_seconds)}</span>
        <span>{Math.round(frac * 100)}% נותרו</span>
      </div>

      {/* Active timer */}
      {running && (
        <div style={{
          marginTop: 18, padding: '14px 18px', borderRadius: 12,
          backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 99, backgroundColor: C.accent,
              boxShadow: '0 0 0 0 rgba(13,148,136,0.5)', animation: 'hbPulse 1.4s infinite',
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>טיימר פעיל</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>
            {formatClock(elapsed)}
          </div>
        </div>
      )}
      {running && bank.active_note && (
        <div style={{ marginTop: 8, fontSize: 13, color: C.sub }}>
          הערה: {bank.active_note}
        </div>
      )}

      {/* Empty-bank notice */}
      {empty && !running && (
        <div style={{
          marginTop: 18, padding: '12px 16px', borderRadius: 12,
          backgroundColor: C.dangerSub, border: `1px solid ${C.dangerRim}`,
          fontSize: 13.5, fontWeight: 500, color: C.danger,
        }}>
          הבנק ריק — יש להטעין שעות מחדש כדי להתחיל עבודה.
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {!running ? (
          <ActionButton label="התחלת עבודה" variant="primary" onClick={onStart} disabled={empty} busy={busy} />
        ) : (
          <ActionButton label="עצירה" variant="danger" onClick={onStop} busy={busy} />
        )}
        <ActionButton label="הטען מחדש" variant="ghost" onClick={onReload} busy={busy} />
      </div>

      <style>{`
        @keyframes hbPulse {
          0%   { box-shadow: 0 0 0 0 rgba(13,148,136,0.45); }
          70%  { box-shadow: 0 0 0 8px rgba(13,148,136,0); }
          100% { box-shadow: 0 0 0 0 rgba(13,148,136,0); }
        }
      `}</style>
    </div>
  );
}
