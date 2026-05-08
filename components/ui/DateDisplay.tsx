/**
 * Unified date display — Hebrew + Gregorian + time, every time.
 *
 * Default layout (`variant="stacked"`, the recommended one):
 *
 *   יום שני · 4 במאי 2026          ← primary line
 *   י״ז באייר תשפ״ו · 10:31         ← secondary line (smaller, muted)
 *
 * Compact layout (`variant="compact"`) — for chips and tight cells.
 * Single row, gregorian first, hebrew abbreviated (no year), tiny font:
 *
 *   יום שני · 4 במאי 2026 · י״ז אייר · 10:31
 *
 * Always RTL. Weekday is the visual anchor (semibold, dark). The hebrew
 * calendar line is intentionally lighter than the gregorian line so the
 * eye reads gregorian first, hebrew as supporting context.
 *
 * Use the `smartToday` flag to swap the weekday for "היום"/"מחר" when
 * the date matches the current/next day.
 */

import { dateParts, type DatePartsOpts } from '@/lib/dateUtils';

export type DateVariant = 'stacked' | 'compact';
export type DateSize = 'sm' | 'md';

interface Props extends DatePartsOpts {
  date: Date | string | null | undefined;
  variant?: DateVariant;
  size?: DateSize;
  /** Override the muted color (e.g. dark backgrounds). */
  muted?: string;
  /** Override the strong color (weekday + gregorian primary line). */
  strong?: string;
  /** Inline style escape hatch — applied to the wrapper. */
  style?: React.CSSProperties;
}

const SIZES: Record<DateSize, {
  primaryFs: number; secondaryFs: number; lineH: number; gap: number;
}> = {
  sm: { primaryFs: 12, secondaryFs: 11, lineH: 1.4,  gap: 2 },
  md: { primaryFs: 13, secondaryFs: 12, lineH: 1.45, gap: 3 },
};

const SEP = '·';

export default function DateDisplay({
  date, variant = 'stacked', size = 'md',
  withTime, withYear, smartToday,
  muted  = '#94A3B8',
  strong = '#1A2332',
  style,
}: Props) {
  const p = dateParts(date, { withTime, withYear, smartToday });
  if (!p.gregorian) return null;

  const s = SIZES[size];

  if (variant === 'compact') {
    // Single line, all info, abbreviated hebrew (no year).
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          lineHeight: s.lineH, direction: 'rtl', whiteSpace: 'nowrap',
          ...style,
        }}
      >
        <span style={{ fontSize: s.primaryFs, fontWeight: 600, color: strong }}>
          {p.weekday}
        </span>
        <Sep color={muted} />
        <span style={{ fontSize: s.primaryFs, color: muted }}>{p.gregorian}</span>
        <Sep color={muted} />
        <span style={{ fontSize: s.secondaryFs, color: muted, opacity: 0.85 }}>
          {p.hebrewShort}
        </span>
        {p.time && (
          <>
            <Sep color={muted} />
            <span style={{
              fontSize: s.secondaryFs, color: muted,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {p.time}
            </span>
          </>
        )}
      </span>
    );
  }

  // Default: two-row stacked layout.
  return (
    <span
      style={{
        display: 'inline-flex', flexDirection: 'column',
        gap: s.gap, lineHeight: s.lineH, direction: 'rtl',
        ...style,
      }}
    >
      <span style={{
        fontSize: s.primaryFs, fontWeight: 600, color: strong, letterSpacing: '-0.005em',
      }}>
        <span>{p.weekday}</span>
        <SepInline color={muted} />
        <span style={{ fontWeight: 500 }}>{p.gregorian}</span>
      </span>
      <span style={{
        fontSize: s.secondaryFs, color: muted, opacity: 0.95,
      }}>
        <span>{p.hebrew}</span>
        {p.time && (
          <>
            <SepInline color={muted} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.time}</span>
          </>
        )}
      </span>
    </span>
  );
}

function Sep({ color }: { color: string }) {
  return (
    <span aria-hidden="true" style={{
      color, opacity: 0.55, fontSize: 11, lineHeight: 1, userSelect: 'none',
    }}>
      {SEP}
    </span>
  );
}

function SepInline({ color }: { color: string }) {
  return (
    <span aria-hidden="true" style={{
      margin: '0 6px', color, opacity: 0.55, userSelect: 'none',
    }}>
      {SEP}
    </span>
  );
}
