/**
 * Monthly hours report generator — template-based.
 *
 * Loads `public/templates/monthly-report-template.xlsx` once, clones it
 * per call, fills the dynamic cells, and returns the bytes. The template
 * already carries every formula, every merged cell, every border, every
 * font — we only write VALUES into seven categories of cells:
 *
 *   C1            month anchor (1st-of-month Date)            ← drives all date formulas
 *   G1            staff first name (first whitespace token)
 *   J1            staff last name (rest of full_name)
 *   G2            employee_number (free text, may be empty)
 *   J2            role label in Hebrew (from STAFF_ROLE_STYLE)
 *   C..H {row}    up to 3 (start, end) time pairs per day
 *   K {row}       patient names joined by '/'
 *   L {row}       per-session notes joined by ' \\ '
 *
 * Day rows live at row = 3 + day_of_month, so day 1 → row 4 … day 31 →
 * row 34. The template's B-column formulas figure out which days exist
 * in the chosen month (28/29/30/31), and rows that don't get values
 * from us simply stay blank — the COUNTIF / SUM formulas in row 35 / 37
 * pick up the totals automatically.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { roleLabel } from '@/lib/staffRoles';
import type { StaffRole } from '@/types';

/** Template bytes are read once per Lambda cold-start and reused.
 *  Stored as ArrayBuffer because that's what ExcelJS' loader expects
 *  in modern Node — the Buffer subclass type isn't a 1:1 match. */
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
  /** 'HH:MM:SS' or 'HH:MM' — time-only string from sessions.start_time. */
  start_time:  string;
  end_time:    string;
  patient_name: string | null;
  notes:       string | null;
}

export interface BuildOptions {
  staff: {
    full_name:       string;
    role:            StaffRole | string;
    employee_number: string | null;
  };
  /** Sessions for this staff member during the chosen month, any order. */
  sessions: SessionSlot[];
  /** 4-digit year. */
  year:  number;
  /** 1-12. */
  month: number;
}

export interface BuildResult {
  buffer:   Buffer;
  fileName: string;
  /** Diagnostics — useful when debugging "report is empty". */
  stats: {
    sessionCount:        number;
    daysCovered:         number;
    daysSkippedExtra:    number; // count of sessions dropped because >3 on a single day
  };
}

/* ── helpers ───────────────────────────────────────────────────────── */

/** Convert "HH:MM" / "HH:MM:SS" into Excel's time-as-fraction-of-day. */
function timeToFraction(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h  = +m[1];
  const mn = +m[2];
  const s  = m[3] ? +m[3] : 0;
  if (h > 23 || mn > 59 || s > 59) return null;
  return (h * 3600 + mn * 60 + s) / 86400;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0)  return { first: '', last: '' };
  if (parts.length === 1)  return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

async function loadTemplate(): Promise<ArrayBuffer> {
  if (cachedTemplate) return cachedTemplate;
  const abs = path.join(process.cwd(), TEMPLATE_REL);
  const buf = await fs.readFile(abs);
  // Detach the slice so the cached object doesn't share memory with
  // Node's pooled Buffer.
  cachedTemplate = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return cachedTemplate;
}

/** Group sessions by their YYYY-MM-DD date. Each bucket retains arrival
 *  order from the input array — caller is expected to feed sessions
 *  sorted by date,start_time so the first three slots per day are the
 *  three earliest. */
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
  const { staff, sessions, year, month } = opts;
  if (month < 1 || month > 12)  throw new Error('month must be 1..12');
  if (year < 2000 || year > 2100) throw new Error('year out of range');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await loadTemplate());

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('template missing primary worksheet');

  // 1. Sheet name — month label in Hebrew
  ws.name = HEB_MONTHS[month] ?? String(month);

  // 2. C1 — first-of-month anchor. Every date formula in column B and
  //    every weekday formula in column A flows from this one cell.
  const monthAnchor = new Date(year, month - 1, 1);
  ws.getCell('C1').value = monthAnchor;

  // 3. Identity (G1 first name, J1 last name, G2 employee#, J2 role).
  const { first, last } = splitName(staff.full_name);
  ws.getCell('G1').value = first;
  ws.getCell('J1').value = last;
  ws.getCell('G2').value = (staff.employee_number ?? '').trim() || null;
  ws.getCell('J2').value = roleLabel(staff.role);

  // 4. Per-day rows.
  const byDate = groupByDate(sessions);
  let daysCovered = 0;
  let daysSkippedExtra = 0;
  const lastDay = new Date(year, month, 0).getDate(); // 28/29/30/31

  for (let day = 1; day <= lastDay; day++) {
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const slotsAll = byDate.get(ymd) ?? [];
    if (slotsAll.length === 0) continue;

    daysCovered++;
    const slots = slotsAll.slice(0, 3);
    if (slotsAll.length > 3) daysSkippedExtra += slotsAll.length - 3;

    const row = 3 + day; // day 1 → row 4 … day 31 → row 34

    // Time pairs — write only when the time parses cleanly. Cells stay
    // empty otherwise so the I-column overflow formula keeps working.
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

    // K — patient names joined by '/' (matches the convention seen in
    // hand-filled reports).
    const patientNames = slotsAll
      .map(s => (s.patient_name ?? '').trim())
      .filter(Boolean);
    if (patientNames.length > 0) {
      // De-dup while preserving order.
      const seen = new Set<string>();
      const unique = patientNames.filter(n => seen.has(n) ? false : (seen.add(n), true));
      ws.getCell(`K${row}`).value = unique.join('/');
    }

    // L — notes joined by ' \\ ' (also from the hand-filled convention).
    const notes = slotsAll
      .map(s => (s.notes ?? '').trim())
      .filter(Boolean);
    if (notes.length > 0) {
      ws.getCell(`L${row}`).value = notes.join(' \\\\ ');
    }
  }

  // 5. Force Excel to recalc all formulas on first open. Without this,
  //    Excel might cache stale results from when the template was saved.
  if (wb.calcProperties) wb.calcProperties.fullCalcOnLoad = true;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const fileName = `monthly-report-${first || 'staff'}-${last || ''}-${year}-${String(month).padStart(2, '0')}.xlsx`
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return {
    buffer,
    fileName,
    stats: { sessionCount: sessions.length, daysCovered, daysSkippedExtra },
  };
}

