/**
 * Jewish-holiday lookup for calendar views, powered by @hebcal/core (the
 * Hebcal engine). Computed locally — no network calls, no API key. Uses the
 * Israel holiday scheme (single-day Yom Tov, no Diaspora second days),
 * matching this app's audience.
 *
 * This is separate from lib/dateUtils.ts, which only formats the Hebrew
 * *date* (day/month/year in gematria) via Intl — this module adds the
 * *events* on top of it: Yom Tov, fasts, Chol HaMoed, Rosh Chodesh, modern
 * and minor holidays.
 */
import { HebrewCalendar, flags } from '@hebcal/core';

export type HolidayTier = 'yomtov' | 'fast' | 'cholHamoed' | 'note';

export interface HolidayInfo {
  /** Hebrew display name, e.g. "ראש השנה" (trailing Hebrew-year number stripped). */
  name: string;
  tier: HolidayTier;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** How notable an event is, used to pick one label when a day has several
 *  (e.g. Rosh Chodesh Tevet falling during Chanukah). */
function rank(f: number): number {
  if (f & flags.CHAG) return 100;
  if (f & flags.MAJOR_FAST) return 90;
  if (f & flags.MINOR_FAST) return 85;
  if (f & flags.CHOL_HAMOED) return 80;
  if (f & flags.MODERN_HOLIDAY) return 70;
  if (f & flags.CHANUKAH_CANDLES) return 65;
  if (f & flags.MINOR_HOLIDAY) return 40;
  if (f & flags.ROSH_CHODESH) return 30;
  if (f & flags.EREV) return 20;
  return 0;
}

function tierOf(f: number): HolidayTier {
  if ((f & flags.CHAG) && !(f & flags.EREV)) return 'yomtov';
  if (f & (flags.MAJOR_FAST | flags.MINOR_FAST)) return 'fast';
  if (f & flags.CHOL_HAMOED) return 'cholHamoed';
  return 'note';
}

/**
 * Holidays / fasts / Chol HaMoed / Rosh Chodesh etc. for every day in
 * [start, end] (inclusive), keyed by "YYYY-MM-DD" (local date, matching the
 * `ymd()` helpers used across the calendar views). Liturgical-only events
 * (weekly parsha, daf yomi, omer count, molad, special Shabbat...) are left
 * out to keep the task calendar readable — at most one label per day.
 */
export function getHolidaysInRange(start: Date, end: Date): Map<string, HolidayInfo> {
  const map = new Map<string, HolidayInfo>();
  const ranked = new Map<string, number>();

  let events: ReturnType<typeof HebrewCalendar.calendar>;
  try {
    events = HebrewCalendar.calendar({
      start, end,
      il: true,
      noMinorFast: false,
      noModern: false,
      noRoshChodesh: false,
      noSpecialShabbat: true,
      noHolidays: false,
    });
  } catch {
    return map;
  }

  for (const ev of events) {
    const f = ev.getFlags();
    const r = rank(f);
    if (r <= 0) continue;
    const key = ymd(ev.getDate().greg());
    const prevRank = ranked.get(key) ?? -1;
    if (r > prevRank) {
      ranked.set(key, r);
      // "he-x-NoNikud" → clean Hebrew text with no vowel points, matching
      // the rest of the app. Strip a trailing Hebrew-year number (Rosh
      // Hashana's title includes one, e.g. "ראש השנה 5787") — the calendar
      // already shows the Hebrew year in its own header.
      const name = ev.renderBrief('he-x-NoNikud').replace(/\s+\d{3,4}$/, '');
      map.set(key, { name, tier: tierOf(f) });
    }
  }
  return map;
}
