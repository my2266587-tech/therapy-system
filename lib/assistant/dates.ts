/**
 * Hebrew date phrase → date range.
 *
 * Recognizes the everyday phrases the staff actually type:
 *   היום · מחר · אתמול · שלשום · השבוע · שבוע שעבר · שבוע הבא ·
 *   החודש · חודש שעבר · חודש קודם · יום ראשון…שבת · DD/MM[/YYYY]
 *
 * Returns YYYY-MM-DD bounds (inclusive). When nothing matches → null.
 */

export interface DateRange {
  start: string;     // 'YYYY-MM-DD'
  end:   string;     // 'YYYY-MM-DD'
  label: string;     // human-readable Hebrew
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}

function startOfWeek(d: Date): Date {
  // Sunday = 0 in JS getDay() — that matches the Israeli work week.
  const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x;
}

function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Most recent past occurrence of a Hebrew weekday name (today counts). */
const WEEKDAYS: Record<string, number> = {
  'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
};

function lastWeekdayOnOrBefore(target: number, today: Date): Date {
  const t = startOfDay(today);
  const diff = (t.getDay() - target + 7) % 7;
  return addDays(t, -diff);
}

function nextWeekdayOnOrAfter(target: number, today: Date): Date {
  const t = startOfDay(today);
  const diff = (target - t.getDay() + 7) % 7;
  return addDays(t, diff);
}

const HEBREW_MONTHS_HE: Record<string, number> = {
  'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'מארס': 2, 'אפריל': 3, 'מאי': 4, 'יוני': 5,
  'יולי': 6, 'אוגוסט': 7, 'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11,
};

/**
 * Try to extract a date range from a Hebrew sentence.
 * @param now  Reference "today" — defaults to system clock; injectable for tests.
 */
export function parseHebrewDateRange(text: string, now: Date = new Date()): DateRange | null {
  const t = text.trim();

  // Single anchor day: היום / מחר / אתמול / שלשום
  if (/(?:^|[\s,?.!])היום(?:$|[\s,?.!])/.test(t)) {
    const d = startOfDay(now);
    return { start: ymd(d), end: ymd(d), label: 'היום' };
  }
  if (/(?:^|[\s,?.!])מחר(?:$|[\s,?.!])/.test(t)) {
    const d = addDays(now, 1);
    return { start: ymd(d), end: ymd(d), label: 'מחר' };
  }
  if (/(?:^|[\s,?.!])אתמול(?:$|[\s,?.!])/.test(t)) {
    const d = addDays(now, -1);
    return { start: ymd(d), end: ymd(d), label: 'אתמול' };
  }
  if (/(?:^|[\s,?.!])שלשום(?:$|[\s,?.!])/.test(t)) {
    const d = addDays(now, -2);
    return { start: ymd(d), end: ymd(d), label: 'שלשום' };
  }

  // Week ranges
  if (/שבוע (?:שעבר|הקודם|קודם)|השבוע שעבר/.test(t)) {
    const lastSun = addDays(startOfWeek(now), -7);
    const lastSat = addDays(lastSun, 6);
    return { start: ymd(lastSun), end: ymd(lastSat), label: 'השבוע שעבר' };
  }
  if (/שבוע הבא|השבוע הבא/.test(t)) {
    const nextSun = addDays(startOfWeek(now), 7);
    const nextSat = addDays(nextSun, 6);
    return { start: ymd(nextSun), end: ymd(nextSat), label: 'שבוע הבא' };
  }
  if (/(?:^|\s)השבוע(?:$|[\s,?.!])/.test(t)) {
    return { start: ymd(startOfWeek(now)), end: ymd(endOfWeek(now)), label: 'השבוע' };
  }

  // Month ranges
  if (/חודש (?:שעבר|קודם|הקודם)|החודש שעבר|חודש לפני/.test(t)) {
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start: ymd(startOfMonth(ref)), end: ymd(endOfMonth(ref)), label: 'חודש שעבר' };
  }
  if (/(?:^|\s)החודש(?:$|[\s,?.!])|חודש זה/.test(t)) {
    return { start: ymd(startOfMonth(now)), end: ymd(endOfMonth(now)), label: 'החודש' };
  }

  // Weekday name — "ביום שני", "יום שני", "שני"
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    const re = new RegExp(`(?:^|\\s|ב)יום\\s+${name}(?:$|[\\s,?.!])|(?:^|\\s)${name}(?:$|[\\s,?.!])`);
    if (re.test(t)) {
      // Disambiguate: if "הבא" appears nearby, use upcoming; else most recent past.
      const upcoming = /הבא|הקרוב/.test(t);
      const d = upcoming ? nextWeekdayOnOrAfter(dow, now) : lastWeekdayOnOrBefore(dow, now);
      return { start: ymd(d), end: ymd(d), label: `יום ${name}` };
    }
  }

  // Explicit DD/MM or DD/MM/YYYY  (also DD.MM[.YYYY] and DD-MM[-YYYY])
  const explicit = t.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
  if (explicit) {
    const day  = Number(explicit[1]);
    const mon  = Number(explicit[2]) - 1;
    const yr   = explicit[3] ? Number(explicit[3]) : now.getFullYear();
    const fullYr = yr < 100 ? 2000 + yr : yr;
    const d = new Date(fullYr, mon, day);
    if (!isNaN(d.getTime())) {
      return { start: ymd(d), end: ymd(d), label: `${pad(day)}/${pad(mon + 1)}/${fullYr}` };
    }
  }

  // "DD בחודש" — e.g. "5 במאי"
  const heMonth = t.match(/(\d{1,2})\s+ב?(ינואר|פברואר|מרץ|מארס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/);
  if (heMonth) {
    const day = Number(heMonth[1]);
    const mon = HEBREW_MONTHS_HE[heMonth[2]];
    if (mon !== undefined) {
      const d = new Date(now.getFullYear(), mon, day);
      // If the resolved date is more than ~6 months ahead, assume previous year (past tense).
      if (d.getTime() - now.getTime() > 1000 * 60 * 60 * 24 * 200) d.setFullYear(d.getFullYear() - 1);
      return { start: ymd(d), end: ymd(d), label: `${day} ב${heMonth[2]}` };
    }
  }

  return null;
}
