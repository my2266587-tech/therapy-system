/**
 * Monthly report generator — single sheet, ALL sessions for the month.
 *
 *   Loads `public/templates/monthly-report-template.xlsx`, fills the
 *   dynamic cells of its main sheet ('ינואר'), and returns the bytes.
 *   The shared 'גיליון1' lookup sheet (weekday number → Hebrew letter)
 *   stays as-is so the column-A VLOOKUPs keep resolving.
 *
 *   This is a calendar report, not a staff report. There is no concept
 *   of "report per therapist" — every completed session in the month
 *   lands on the row matching its date, regardless of which therapist
 *   ran it.
 *
 * What we write (everything else is left untouched):
 *
 *   C1            month anchor (1st-of-month Date)   ← drives all date formulas
 *   sheet.name    Hebrew label for the month         (e.g. 'מרץ')
 *   C..H {row}    up to 3 (start, end) time pairs for the day's sessions
 *   K {row}       patient names joined by '/'
 *   L {row}       per-session notes joined by ' \\ '
 *
 * Day rows live at row = 3 + day_of_month, so day 1 → row 4 … day 31 →
 * row 34. The template's B-column date formulas figure out which days
 * exist in the chosen month (28/29/30/31), and the footer formulas in
 * row 35 / 37 pick up totals automatically.
 *
 * G1/J1/G2/J2 (staff identity cells in earlier iterations) are LEFT
 * BLANK — the template ships them null and this is a calendar report,
 * not a per-staff one.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

let cachedTemplate: ArrayBuffer | null = null;
const TEMPLATE_REL = path.join('public', 'templates', 'monthly-report-template.xlsx');

const HEB_MONTHS: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ',     4: 'אפריל',
  5: 'מאי',   6: 'יוני',   7: 'יולי',     8: 'אוגוסט',
  9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
};

export interface SessionSlot {
  /** ISO date 'YYYY-MM-DD'. */
  date:        string;
  /** 'HH:MM' or 'HH:MM:SS'. */
  start_time:  string;
  end_time:    string;
  patient_name: string | null;
  notes:       string | null;
}

export interface BuildOptions {
  sessions: SessionSlot[];
  year:  number;
  month: number;
}

export interface BuildResult {
  buffer:   Buffer;
  fileName: string;
  stats: {
    sessionCount:     number;
    daysCovered:      number;
    daysSkippedExtra: number;  // sessions beyond the 3rd on any given day
  };
}

/* ── helpers ───────────────────────────────────────────────────────── */

function timeToFraction(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h  = +m[1];
  const mn = +m[2];
  const s  = m[3] ? +m[3] : 0;
  if (h > 23 || mn > 59 || s > 59) return null;
  return (h * 3600 + mn * 60 + s) / 86400;
}

async function loadTemplate(): Promise<ArrayBuffer> {
  if (cachedTemplate) return cachedTemplate;
  const abs = path.join(process.cwd(), TEMPLATE_REL);
  const buf = await fs.readFile(abs);
  cachedTemplate = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return cachedTemplate;
}

function groupByDate(sessions: SessionSlot[]): Map<string, SessionSlot[]> {
  const out = new Map<string, SessionSlot[]>();
  for (const s of sessions) {
    if (!s.date) continue;
    const arr = out.get(s.date);
    if (arr) arr.push(s);
    else     out.set(s.date, [s]);
  }
  return out;
}

const TIME_PAIR_COLS: ReadonlyArray<readonly [string, string]> = [
  ['C', 'D'],   // slot 1
  ['E', 'F'],   // slot 2
  ['G', 'H'],   // slot 3
];

/* ── main entry ────────────────────────────────────────────────────── */

export async function buildMonthlyReport(opts: BuildOptions): Promise<BuildResult> {
  const { sessions, year, month } = opts;
  if (month < 1 || month > 12)    throw new Error('month must be 1..12');
  if (year < 2000 || year > 2100) throw new Error('year out of range');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await loadTemplate());

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('template missing primary worksheet');

  // 1. Sheet name = Hebrew month label.
  ws.name = HEB_MONTHS[month] ?? String(month);

  // 2. C1 — first-of-month Date. Drives the B-column date formulas and
  //    the A-column weekday VLOOKUPs that reference 'גיליון1'.
  ws.getCell('C1').value = new Date(year, month - 1, 1);

  // 3. Day rows — one per day-of-month, written only when the day has
  //    at least one session.
  const byDate = groupByDate(sessions);
  let daysCovered = 0;
  let daysSkippedExtra = 0;
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day++) {
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const slotsAll = byDate.get(ymd) ?? [];
    if (slotsAll.length === 0) continue;

    daysCovered++;
    const slots = slotsAll.slice(0, 3);
    if (slotsAll.length > 3) daysSkippedExtra += slotsAll.length - 3;

    const row = 3 + day;

    for (let i = 0; i < slots.length; i++) {
      const [colStart, colEnd] = TIME_PAIR_COLS[i];
      const start = timeToFraction(slots[i].start_time);
      const end   = timeToFraction(slots[i].end_time);
      if (start != null) {
        const c = ws.getCell(`${colStart}${row}`);
        c.value  = start;
        c.numFmt = 'h:mm';
      }
      if (end != null) {
        const c = ws.getCell(`${colEnd}${row}`);
        c.value  = end;
        c.numFmt = 'h:mm';
      }
    }

    // K — patient names joined by '/'. ALL sessions for the day go in
    // here (not just the first 3) — clinicians want to see who came
    // even if there were more than 3 visits.
    const patientNames = slotsAll
      .map(s => (s.patient_name ?? '').trim())
      .filter(Boolean);
    if (patientNames.length > 0) {
      const seen = new Set<string>();
      const unique = patientNames.filter(n => seen.has(n) ? false : (seen.add(n), true));
      ws.getCell(`K${row}`).value = unique.join('/');
    }

    // L — notes joined by ' \\ '.
    const notes = slotsAll
      .map(s => (s.notes ?? '').trim())
      .filter(Boolean);
    if (notes.length > 0) {
      ws.getCell(`L${row}`).value = notes.join(' \\\\ ');
    }
  }

  // 4. Force Excel to recompute formulas on first open.
  wb.calcProperties = { ...(wb.calcProperties ?? {}), fullCalcOnLoad: true };

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Pure ASCII filename — Hebrew bytes (>0xFF) break Web Headers when
  // the route sets Content-Disposition. The Hebrew month label is in
  // the workbook itself (sheet name + C1) and in the email subject.
  const fileName = `monthly-report-${year}-${String(month).padStart(2, '0')}.xlsx`;

  return {
    buffer,
    fileName,
    stats: { sessionCount: sessions.length, daysCovered, daysSkippedExtra },
  };
}
