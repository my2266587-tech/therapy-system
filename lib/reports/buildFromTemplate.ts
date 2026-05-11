/**
 * Monthly hours report generator — template-based, bundled output.
 *
 * Loads `public/templates/monthly-report-template.xlsx` once, clones the
 * main "ינואר" sheet once per staff member, fills the dynamic cells, and
 * returns a SINGLE xlsx with one main sheet per staff plus the shared
 * `גיליון1` lookup sheet that all VLOOKUP-by-weekday formulas reference.
 *
 * The legacy `buildMonthlyReport` (one staff → one file) is gone — both
 * the on-demand UI and the monthly cron consume `buildMonthlyReportBundle`
 * and the cron emails ONE attachment.
 *
 * For each main sheet we only write VALUES into these cells; everything
 * else (formulas, merged cells, borders, fonts, column widths, the
 * lookup sheet) is preserved by the template clone:
 *
 *   C1            month anchor (1st-of-month Date)            ← drives all date formulas
 *   G1            staff first name (first whitespace token)
 *   J1            staff last name (rest of full_name)
 *   G2            employee_number (free text, may be empty)
 *   J2            role label in Hebrew (from staffRoles.ts)
 *   C..H {row}    up to 3 (start, end) time pairs per day
 *   K {row}       patient names joined by '/'
 *   L {row}       per-session notes joined by ' \\ '
 *
 * Day rows live at row = 3 + day_of_month, so day 1 → row 4 … day 31 →
 * row 34. The template's B-column formulas figure out which days exist
 * in the chosen month (28/29/30/31), and rows that don't get values
 * from us stay blank — COUNTIF / SUM in row 35 / 37 pick up the totals
 * automatically.
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

/** Excel forbids these in sheet names; also caps at 31 chars. */
const SHEET_NAME_FORBIDDEN = /[\\\/?*\[\]:]/g;

export interface SessionSlot {
  /** ISO date 'YYYY-MM-DD'. */
  date:        string;
  /** 'HH:MM:SS' or 'HH:MM' — time-only string from sessions.start_time. */
  start_time:  string;
  end_time:    string;
  patient_name: string | null;
  notes:       string | null;
}

export interface StaffEntry {
  staff: {
    full_name:       string;
    role:            StaffRole | string;
    employee_number: string | null;
  };
  sessions: SessionSlot[];
}

export interface BundleOptions {
  staff: StaffEntry[];
  /** 4-digit year. */
  year:  number;
  /** 1-12. */
  month: number;
}

export interface BundleResult {
  buffer:   Buffer;
  fileName: string;
  /** One entry per staff sheet — useful for logs and audit. */
  perStaff: Array<{
    full_name:        string;
    sheet_name:       string;
    sessionCount:     number;
    daysCovered:      number;
    daysSkippedExtra: number;
  }>;
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

/**
 * Make `desired` safe + unique within `taken`. Sheet names are capped
 * at 31 chars and may not contain `\ / ? * [ ]` or ':'. Empty names are
 * replaced with a fallback. Collisions get " (2)", " (3)", …
 */
function sanitizeSheetName(desired: string, taken: Set<string>, fallback: string): string {
  let base = desired.trim().replace(SHEET_NAME_FORBIDDEN, ' ').replace(/\s+/g, ' ').trim();
  if (!base) base = fallback;
  if (base.length > 31) base = base.slice(0, 31);
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`;
    const trimmed = base.length + suffix.length > 31
      ? base.slice(0, 31 - suffix.length) + suffix
      : base + suffix;
    if (!taken.has(trimmed)) {
      taken.add(trimmed);
      return trimmed;
    }
  }
  // Pathological — fall back to fallback + random.
  const last = `${fallback}-${Date.now() % 10000}`;
  taken.add(last);
  return last;
}

/**
 * Deep-copy a worksheet's structure (formulas, values, styles, merges,
 * column widths, row heights) from `source` to `target`. Both worksheets
 * must belong to ExcelJS workbooks loaded from the same template, so the
 * style numFmt strings line up — the target workbook's style table
 * de-duplicates internally when we assign each cell's style object back.
 *
 * Used so we can clone the template's main sheet N times within ONE
 * output workbook without re-loading the template into N separate files.
 * The shared `גיליון1` lookup sheet stays in the target workbook once;
 * every cloned main sheet's VLOOKUP keeps resolving to it.
 */
function copyWorksheetStructure(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet): void {
  // Column widths + hidden state
  source.columns?.forEach((col, idx) => {
    if (!col) return;
    const tgt = target.getColumn(idx + 1);
    if (col.width  != null) tgt.width  = col.width;
    if (col.hidden != null) tgt.hidden = col.hidden;
  });

  // Sheet-wide properties + page setup (RTL, print area, margins).
  if (source.views)         target.views        = JSON.parse(JSON.stringify(source.views));
  if (source.pageSetup)     target.pageSetup    = JSON.parse(JSON.stringify(source.pageSetup));
  if (source.properties)    target.properties   = JSON.parse(JSON.stringify(source.properties));
  if (source.headerFooter)  target.headerFooter = JSON.parse(JSON.stringify(source.headerFooter));

  // Cells: walk all defined rows (including empty ones so row heights
  // and any blank-but-styled cells survive).
  source.eachRow({ includeEmpty: true }, (srcRow, rowNumber) => {
    const tgtRow = target.getRow(rowNumber);
    if (srcRow.height != null) tgtRow.height = srcRow.height;

    srcRow.eachCell({ includeEmpty: true }, (srcCell, colNumber) => {
      const tgtCell = tgtRow.getCell(colNumber);
      // Assigning cell.value with a {formula,result} object preserves
      // both the formula text AND the cached calculated value — Excel
      // will recompute anyway thanks to fullCalcOnLoad, but cached
      // result is what other tools (and our harness) read back.
      tgtCell.value = srcCell.value;
      if (srcCell.numFmt)     tgtCell.numFmt    = srcCell.numFmt;
      if (srcCell.font)       tgtCell.font      = { ...srcCell.font };
      if (srcCell.alignment)  tgtCell.alignment = { ...srcCell.alignment };
      if (srcCell.border)     tgtCell.border    = JSON.parse(JSON.stringify(srcCell.border));
      if (srcCell.fill)       tgtCell.fill      = JSON.parse(JSON.stringify(srcCell.fill));
      if (srcCell.protection) tgtCell.protection = { ...srcCell.protection };
    });
    tgtRow.commit?.();
  });

  // Merges. ExcelJS stores them at the worksheet model.
  const merges = ((source.model as { merges?: string[] }).merges ?? []).slice();
  for (const range of merges) {
    try { target.mergeCells(range); } catch { /* already merged */ }
  }
}

/**
 * Populate one staff's sheet. Pure mutation — no workbook I/O. Returns
 * per-staff stats for the bundle audit.
 */
function fillStaffSheet(
  ws:       ExcelJS.Worksheet,
  entry:    StaffEntry,
  year:     number,
  month:    number,
): { sessionCount: number; daysCovered: number; daysSkippedExtra: number } {
  const { staff, sessions } = entry;

  // C1 — first-of-month anchor. Every date formula in column B and
  // every weekday formula in column A flows from this one cell.
  ws.getCell('C1').value = new Date(year, month - 1, 1);

  // G1/J1/G2/J2 — identity block.
  const { first, last } = splitName(staff.full_name);
  ws.getCell('G1').value = first;
  ws.getCell('J1').value = last;
  ws.getCell('G2').value = (staff.employee_number ?? '').trim() || null;
  ws.getCell('J2').value = roleLabel(staff.role);

  // Per-day rows.
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

    const patientNames = slotsAll
      .map(s => (s.patient_name ?? '').trim())
      .filter(Boolean);
    if (patientNames.length > 0) {
      const seen = new Set<string>();
      const unique = patientNames.filter(n => seen.has(n) ? false : (seen.add(n), true));
      ws.getCell(`K${row}`).value = unique.join('/');
    }

    const notes = slotsAll
      .map(s => (s.notes ?? '').trim())
      .filter(Boolean);
    if (notes.length > 0) {
      ws.getCell(`L${row}`).value = notes.join(' \\\\ ');
    }
  }

  return { sessionCount: sessions.length, daysCovered, daysSkippedExtra };
}

/* ── main entry ────────────────────────────────────────────────────── */

/**
 * Build the single monthly report file — one workbook with one main
 * sheet per staff member plus the shared lookup sheet (`גיליון1`).
 *
 * Empty staff list → throws. Caller should decide what "no data" means
 * (the cron treats it as a no-op and returns 200 with a message).
 */
export async function buildMonthlyReportBundle(opts: BundleOptions): Promise<BundleResult> {
  const { staff: staffEntries, year, month } = opts;
  if (month < 1 || month > 12)     throw new Error('month must be 1..12');
  if (year < 2000 || year > 2100)  throw new Error('year out of range');
  if (staffEntries.length === 0)   throw new Error('staff list is empty');

  const templateAb = await loadTemplate();

  // Output workbook starts as a fresh load of the template — this
  // gives us the empty main sheet + the lookup sheet.
  const outWb = new ExcelJS.Workbook();
  await outWb.xlsx.load(templateAb);
  const baseMainSheet   = outWb.worksheets[0];   // ינואר (to be reused for staff #0)
  const baseLookupSheet = outWb.worksheets[1];   // גיליון1 (stays as-is, shared)
  if (!baseMainSheet)   throw new Error('template missing primary worksheet');
  if (!baseLookupSheet) throw new Error('template missing lookup worksheet');

  // Hold on to a SOURCE workbook we never mutate — needed because once
  // we fill the first sheet, we can't re-read the template structure
  // from it; we re-read from a pristine copy each time we need to clone.
  // Loading happens lazily inside the loop.
  let pristineSource: ExcelJS.Worksheet | null = null;
  async function getPristineMainSheet(): Promise<ExcelJS.Worksheet> {
    if (pristineSource) return pristineSource;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(templateAb);
    pristineSource = wb.worksheets[0];
    return pristineSource;
  }

  const takenSheetNames = new Set<string>([baseLookupSheet.name]);
  const perStaff: BundleResult['perStaff'] = [];

  for (let i = 0; i < staffEntries.length; i++) {
    const entry = staffEntries[i];

    let target: ExcelJS.Worksheet;
    if (i === 0) {
      // Reuse the template's main sheet.
      target = baseMainSheet;
    } else {
      // Add a new sheet and clone the template's main-sheet structure
      // (formulas, merges, styles, column widths) into it.
      const source = await getPristineMainSheet();
      const placeholderName = `__staff_${i}__`;
      target = outWb.addWorksheet(placeholderName);
      copyWorksheetStructure(source, target);
    }

    const stats     = fillStaffSheet(target, entry, year, month);
    const finalName = sanitizeSheetName(entry.staff.full_name, takenSheetNames, `איש צוות ${i + 1}`);
    target.name = finalName;

    perStaff.push({
      full_name:        entry.staff.full_name,
      sheet_name:       finalName,
      sessionCount:     stats.sessionCount,
      daysCovered:      stats.daysCovered,
      daysSkippedExtra: stats.daysSkippedExtra,
    });
  }

  // Force recalc on first open — Excel might otherwise show cached
  // results from when the template was originally saved.
  outWb.calcProperties = { ...(outWb.calcProperties ?? {}), fullCalcOnLoad: true };

  const arrayBuffer = await outWb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const monthLabel = HEB_MONTHS[month] ?? String(month);
  const fileName = `monthly-report-${year}-${String(month).padStart(2, '0')}-${monthLabel}.xlsx`
    .replace(/\s+/g, '-');

  return { buffer, fileName, perStaff };
}
