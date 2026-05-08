/**
 * Unified date display — "יום שני | 4 במאי 2026 | 10:31".
 *
 * Single component, two layouts:
 *   variant="line"     →  one row, separators between segments
 *   variant="stacked"  →  weekday on top, date+time below
 *
 * Always RTL. The weekday is the visual emphasis: bolder + darker than
 * the date+time tail, regardless of layout. "size" picks a coherent
 * (font, line-height, gap) preset rather than letting callers drift.
 *
 * For the smart "היום"/"מחר" prefix used in some lists, pass smartToday.
 */

import { dateParts, type DatePartsOpts } from '@/lib/dateUtils';

export type DateVariant = 'line' | 'stacked';
export type DateSize = 'sm' | 'md';

interface Props extends DatePartsOpts {
  date: Date | string | null | undefined;
  variant?: DateVariant;
  size?: DateSize;
  /** Override the muted color (e.g. white-on-dark). */
  muted?: string;
  /** Override the strong color (weekday). */
  strong?: string;
  /** Inline style escape hatch — applied to the wrapper. */
  style?: React.CSSProperties;
}

const SIZES: Record<DateSize, {
  weekdayFs: number; tailFs: number; lineH: number; gapStacked: number;
}> = {
  sm: { weekdayFs: 12, tailFs: 11, lineH: 1.35, gapStacked: 1 },
  md: { weekdayFs: 13, tailFs: 12, lineH: 1.4,  gapStacked: 2 },
};

const SEP = '|';

export default function DateDisplay({
  date, variant = 'line', size = 'md',
  withTime, withYear, smartToday,
  muted  = '#94A3B8',
  strong = '#1A2332',
  style,
}: Props) {
  const p = dateParts(date, { withTime, withYear, smartToday });
  if (!p.gregorian) return null;

  const s = SIZES[size];

  if (variant === 'stacked') {
    return (
      <span
        style={{
          display: 'inline-flex', flexDirection: 'column',
          gap: s.gapStacked, lineHeight: s.lineH, direction: 'rtl',
          ...style,
        }}
      >
        <span style={{ fontSize: s.weekdayFs, fontWeight: 600, color: strong }}>
          {p.weekday}
        </span>
        <span style={{ fontSize: s.tailFs, color: muted }}>
          {[p.gregorian, p.time].filter(Boolean).join(` ${SEP} `)}
        </span>
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        lineHeight: s.lineH, direction: 'rtl', whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ fontSize: s.weekdayFs, fontWeight: 600, color: strong }}>
        {p.weekday}
      </span>
      <Sep color={muted} />
      <span style={{ fontSize: s.tailFs, color: muted }}>{p.gregorian}</span>
      {p.time && (
        <>
          <Sep color={muted} />
          <span style={{ fontSize: s.tailFs, color: muted, fontVariantNumeric: 'tabular-nums' }}>
            {p.time}
          </span>
        </>
      )}
    </span>
  );
}

function Sep({ color }: { color: string }) {
  return (
    <span aria-hidden="true" style={{
      color, opacity: 0.6, fontSize: 11, lineHeight: 1, userSelect: 'none',
    }}>
      {SEP}
    </span>
  );
}
