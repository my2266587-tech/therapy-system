/**
 * Hebrew question parser → { intent, params }.
 *
 * Heuristic, not AI. The goal is:
 *   1. Recognize the intent keyword (פגישות, סיכומים, תשלומים, ...)
 *   2. Extract a date range if the user mentioned one.
 *   3. Extract a patient-name candidate if the user pointed at someone.
 *
 * If we can't classify, intent is 'unknown' and the API returns a friendly
 * "I didn't understand — try one of these" with example questions.
 */

import { parseHebrewDateRange, type DateRange } from './dates';

export type Intent =
  | 'sessionsByDate'
  | 'upcomingSessions'
  | 'missingSummaries'
  | 'openPayments'
  | 'unprocessedRecordings'
  | 'patientDocuments'
  | 'patientTimeline'
  | 'help'
  | 'unknown';

export interface ParsedQuestion {
  intent: Intent;
  range?: DateRange;
  name?: string;
  raw: string;
}

/* ── name extraction ───────────────────────────────────────────────────── */

// Words that should never be treated as a patient name even if they appear
// after "של" / "ל" / "עבור". Conservative — better to miss a name than to
// misread "של היום" as a person.
const STOPWORDS = new Set([
  'היום', 'מחר', 'אתמול', 'שלשום', 'השבוע', 'החודש', 'שבוע', 'חודש',
  'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
  'מטופלת', 'מטופלות', 'פגישה', 'פגישות', 'סיכום', 'סיכומים',
  'תשלום', 'תשלומים', 'הקלטה', 'הקלטות', 'מסמך', 'מסמכים',
  'הבא', 'הבאה', 'הקרוב', 'הקרובה', 'אחרון', 'אחרונה',
  'כל', 'כלל', 'איזו', 'איזה', 'אילו', 'מי', 'מה', 'מתי', 'איפה',
  'יש', 'הייתה', 'היה', 'היתה',
]);

function extractPatientName(text: string): string | undefined {
  // Strip leading question words to clean the tail.
  const stripped = text.replace(/[?!.]+$/g, '');

  // Pattern 1 — quoted: "שרה כהן" or 'שרה'
  const quoted = stripped.match(/["']([^"']{2,})["']/);
  if (quoted) return quoted[1].trim();

  // Pattern 2 — after "של" / "עבור" / "למטופלת" / "למטופלת " / "ל"
  // Take 1-3 hebrew tokens that are not stopwords.
  const m = stripped.match(/(?:של|עבור|למטופלת|למטופל)\s+([֐-׿\s'״׳]+?)(?=[?,.!]|$)/);
  if (m) {
    const candidate = m[1].trim().split(/\s+/).filter(w => !STOPWORDS.has(w)).slice(0, 3).join(' ');
    if (candidate.length >= 2) return candidate;
  }

  return undefined;
}

/* ── intent matching ──────────────────────────────────────────────────── */

interface IntentRule {
  intent: Intent;
  test: (t: string, hasRange: boolean, hasName: boolean) => boolean;
}

const RULES: IntentRule[] = [
  {
    intent: 'help',
    test: t => /^(עזרה|מה אתה יודע|מה את יודעת|דוגמאות|מה אפשר לשאול)/.test(t),
  },
  {
    intent: 'missingSummaries',
    test: t =>
      /(חסר|חסרים|ללא|בלי|לא נכתב|לא נכתבו|חסרים?\s+סיכומ).*סיכומ/.test(t)
      || /סיכומ.*(חסר|לא נכתב|לא הוקלד|חסרים?)/.test(t)
      || /למי\s+חסר/.test(t),
  },
  {
    intent: 'openPayments',
    test: t =>
      /(תשלומ).*(פתוח|טרם שולם|לא שולם|חסר|פתוחים)/.test(t)
      || /(פתוח|טרם שולם|לא שולם).*תשלומ/.test(t),
  },
  {
    intent: 'unprocessedRecordings',
    test: t =>
      /הקלט.*(לא עובד|ממתינ|לא תומלל|בלי תמלול|פתוח)/.test(t)
      || /(לא עובד|ממתינ|לא תומלל).*הקלט/.test(t),
  },
  {
    intent: 'patientDocuments',
    test: (t, _r, hasName) => hasName && /מסמכ/.test(t),
  },
  {
    intent: 'sessionsByDate',
    test: (t, hasRange) =>
      hasRange && (/פגיש|הפגיש|מטופל/.test(t)),
  },
  {
    intent: 'upcomingSessions',
    test: t =>
      /הפגיש.*הבא|פגישה הבאה|פגישות הבאות|פגישות הקרובות|פגישה הקרובה/.test(t)
      || /קרוב/.test(t) && /פגיש/.test(t),
  },
  {
    intent: 'patientTimeline',
    test: (_t, _r, hasName) => hasName,
  },
];

export function parseQuestion(raw: string, now: Date = new Date()): ParsedQuestion {
  const text  = raw.trim();
  const range = parseHebrewDateRange(text, now) ?? undefined;
  const name  = extractPatientName(text);

  for (const rule of RULES) {
    if (rule.test(text, !!range, !!name)) {
      return { intent: rule.intent, range, name, raw };
    }
  }

  return { intent: 'unknown', range, name, raw };
}
