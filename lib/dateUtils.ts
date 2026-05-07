/**
 * Centralized date formatting for Gregorian + Hebrew calendar display.
 * Hebrew dates use Intl with the 'he-IL-u-ca-hebrew' locale (full ICU).
 *
 * All YYYY-MM-DD strings are parsed via parseYMD to avoid the
 * "new Date('2026-05-07')" UTC midnight off-by-one bug.
 */

/* ── Format options ── */
export const PRESETS = {
  long:      { day: 'numeric', month: 'long',  year: 'numeric' } as Intl.DateTimeFormatOptions,
  medium:    { day: 'numeric', month: 'short', year: 'numeric' } as Intl.DateTimeFormatOptions,
  monthDay:  { day: 'numeric', month: 'short' }                  as Intl.DateTimeFormatOptions,
  monthYear: { month: 'long',  year: 'numeric' }                 as Intl.DateTimeFormatOptions,
  monthShort:{ month: 'short' }                                  as Intl.DateTimeFormatOptions,
  dayOnly:   { day: 'numeric' }                                  as Intl.DateTimeFormatOptions,
  weekday:   { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } as Intl.DateTimeFormatOptions,
} as const;

/* ── Parsing ── */
export function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  // YMD = exactly 10 chars "YYYY-MM-DD"
  if (typeof d === 'string' && d.length === 10 && d[4] === '-' && d[7] === '-') {
    return parseYMD(d);
  }
  return new Date(d);
}

/* ── Cached formatters ── */
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + '|' + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, opts); cache.set(key, f); }
  return f;
}

/* ── Gregorian ── */
export function formatGregorian(
  d: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = PRESETS.long,
): string {
  if (!d) return '';
  return fmt('he-IL', opts).format(toDate(d));
}

/* ── Hebrew calendar ── */
export function formatHebrew(
  d: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = PRESETS.long,
): string {
  if (!d) return '';
  return fmt('he-IL-u-ca-hebrew', opts).format(toDate(d));
}

/* ── Convenience presets ── */
export function hebrewDay(d: Date | string | null | undefined): string {
  return formatHebrew(d, PRESETS.dayOnly);
}

export function hebrewLong(d: Date | string | null | undefined): string {
  return formatHebrew(d, PRESETS.long);
}

export function hebrewDayMonth(d: Date | string | null | undefined): string {
  return formatHebrew(d, { day: 'numeric', month: 'long' });
}

/* ── Combined ── */
export function formatDual(
  d: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = PRESETS.long,
): { greg: string; hebrew: string } {
  return { greg: formatGregorian(d, opts), hebrew: formatHebrew(d, opts) };
}
