/**
 * Centralized date formatting for Gregorian + Hebrew calendar display.
 *
 * Hebrew dates use Intl with the 'he-IL-u-ca-hebrew' locale to get the right
 * calendar (Hebrew month names + correct year). However, Node and some browsers
 * ship an ICU build that does NOT support the `nu-hebr` numbering system, so the
 * year and day come out as Latin digits ("אייר 5786" instead of "אייר תשפ״ו").
 *
 * Fix: format with `formatToParts`, then post-replace the numeric `day` and
 * `year` parts with Hebrew gematria letters. The month name from ICU is correct
 * and stays untouched.
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

/* ── Gematria — convert integer to Hebrew letters (e.g. 786 → תשפ״ו, 27 → כ״ז) ──
 * For Hebrew years > 1000, the thousands digit is conventionally dropped
 * (5786 → 786 → תשפ״ו). Days 1–30 fit in two letters at most.
 * Special-cased: 15 → ט״ו, 16 → ט״ז (avoid spelling parts of God's name).
 */
function toGematria(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  let v = n >= 1000 ? n % 1000 : n;
  if (v === 0) return '';

  let out = '';

  // Hundreds (100 – 900)
  while (v >= 400) { out += 'ת'; v -= 400; }
  if      (v >= 300) { out += 'ש'; v -= 300; }
  else if (v >= 200) { out += 'ר'; v -= 200; }
  else if (v >= 100) { out += 'ק'; v -= 100; }

  // Tens & ones with 15/16 special case
  if (v === 15) out += 'טו';
  else if (v === 16) out += 'טז';
  else {
    if      (v >= 90) { out += 'צ'; v -= 90; }
    else if (v >= 80) { out += 'פ'; v -= 80; }
    else if (v >= 70) { out += 'ע'; v -= 70; }
    else if (v >= 60) { out += 'ס'; v -= 60; }
    else if (v >= 50) { out += 'נ'; v -= 50; }
    else if (v >= 40) { out += 'מ'; v -= 40; }
    else if (v >= 30) { out += 'ל'; v -= 30; }
    else if (v >= 20) { out += 'כ'; v -= 20; }
    else if (v >= 10) { out += 'י'; v -= 10; }
    if      (v === 9) out += 'ט';
    else if (v === 8) out += 'ח';
    else if (v === 7) out += 'ז';
    else if (v === 6) out += 'ו';
    else if (v === 5) out += 'ה';
    else if (v === 4) out += 'ד';
    else if (v === 3) out += 'ג';
    else if (v === 2) out += 'ב';
    else if (v === 1) out += 'א';
  }

  // Add gershayim (״) before last letter, or geresh (׳) if single letter.
  if (out.length === 1) return out + '׳';
  return out.slice(0, -1) + '״' + out.slice(-1);
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
  const date  = toDate(d);
  const parts = fmt('he-IL-u-ca-hebrew', opts).formatToParts(date);
  return parts
    .map(p => {
      if (p.type === 'day' || p.type === 'year') {
        const n = parseInt(p.value, 10);
        const g = toGematria(n);
        return g || p.value;
      }
      return p.value;
    })
    .join('');
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

/* ── Unified user-facing date formatter ───────────────────────────────────
 * Single source of truth for the "יום שני | 4 במאי 2026 | 10:31" pattern
 * used in lists, cards, and modals. Use the parts helper when you need
 * granular styling; use the line helpers for plain string output.
 */

export interface DatePartsOpts {
  /** Include HH:MM. Default: true if input has a time component, false otherwise. */
  withTime?: boolean;
  /** Include the year in the gregorian segment. Default: true. */
  withYear?: boolean;
  /** "היום" / "מחר" replaces the weekday for the current/next day. Default: false. */
  smartToday?: boolean;
}

function hasTimeComponent(d: Date | string): boolean {
  if (d instanceof Date) return true;
  // YYYY-MM-DD pure-date strings have no time. Anything with 'T' or ':' does.
  return /[T :]/.test(d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

export interface DateParts {
  weekday: string;       // "יום שני" — or "היום" / "מחר" when smartToday is on
  gregorian: string;     // "4 במאי 2026"
  hebrew: string;        // "י״ז באייר תשפ״ו"  (always present; system requirement)
  hebrewShort: string;   // "י״ז אייר"          (no year, for compact layouts)
  time: string | null;   // "10:31" or null
  isToday: boolean;
  isTomorrow: boolean;
}

/** Granular parts for custom rendering. Hebrew + Gregorian always included. */
export function dateParts(
  d: Date | string | null | undefined,
  opts: DatePartsOpts = {},
): DateParts {
  if (!d) return {
    weekday: '', gregorian: '', hebrew: '', hebrewShort: '',
    time: null, isToday: false, isTomorrow: false,
  };
  const date = toDate(d);
  const withYear = opts.withYear ?? true;
  const withTime = opts.withTime ?? hasTimeComponent(d);

  const weekdayStr  = fmt('he-IL', { weekday: 'long' }).format(date);
  const gregorianStr = formatGregorian(date, withYear ? PRESETS.long : { day: 'numeric', month: 'long' });
  const hebrewStr    = formatHebrew(date, withYear ? PRESETS.long : { day: 'numeric', month: 'long' });
  const hebrewShortStr = formatHebrew(date, { day: 'numeric', month: 'long' });
  const timeStr = withTime
    ? fmt('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
    : null;

  const today    = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const isToday    = isSameDay(date, today);
  const isTomorrow = isSameDay(date, tomorrow);

  let weekday = weekdayStr;
  if (opts.smartToday) {
    if (isToday)    weekday = 'היום';
    else if (isTomorrow) weekday = 'מחר';
  }

  return {
    weekday, gregorian: gregorianStr, hebrew: hebrewStr,
    hebrewShort: hebrewShortStr, time: timeStr, isToday, isTomorrow,
  };
}

/** Two-row strings for stacked layouts.
 *    top:    "יום שני · 4 במאי 2026"
 *    bottom: "י״ז באייר תשפ״ו · 10:31"
 */
export function formatDateStacked(
  d: Date | string | null | undefined,
  opts: DatePartsOpts = {},
): { top: string; bottom: string } {
  const p = dateParts(d, opts);
  if (!p.gregorian) return { top: '', bottom: '' };
  const top    = [p.weekday, p.gregorian].filter(Boolean).join(' · ');
  const bottom = [p.hebrew, p.time].filter(Boolean).join(' · ');
  return { top, bottom };
}

/** Flat string for places (Excel cells, modal labels, copy text) that
 *  must take one line. Compact = no Hebrew calendar.
 *      "יום שני · 4 במאי 2026 · 10:31"
 */
export function formatDateLine(
  d: Date | string | null | undefined,
  opts: DatePartsOpts = {},
): string {
  const p = dateParts(d, opts);
  if (!p.gregorian) return '';
  return [p.weekday, p.gregorian, p.time].filter(Boolean).join(' · ');
}
