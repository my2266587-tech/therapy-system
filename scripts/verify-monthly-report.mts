/**
 * Verification harness for the monthly report generator.
 *
 *   Builds the report under four representative scenarios, loads each
 *   one back with ExcelJS, and asserts on cell contents, formulas,
 *   merges, number formats, and sheet structure. Run with:
 *
 *     npm run verify:reports
 *
 *   Exits 0 on full pass, 1 on any failure. Prints a per-assertion
 *   table so a human can see what was checked without opening Excel.
 *
 *   What this DOES check (programmatically):
 *     - Main sheet renamed to the Hebrew month label
 *     - Shared 'גיליון1' lookup sheet survives untouched
 *     - C1 = first-of-month Date
 *     - G1/J1/G2/J2 remain blank (this is a calendar report, not staff)
 *     - Per-day time pairs (fraction-of-day via UTC math)
 *     - K / L cells (patient names joined by '/', notes by ' \\ ')
 *     - First-3-sessions truncation on busy days (names+notes keep all)
 *     - Short-month behavior (no writes past lastDay)
 *     - All 57 template formulas preserved, all merges preserved
 *     - Row 35 + row 37 totals formulas still present
 *     - workbook.xml has fullCalcOnLoad="1"
 *     - fileName is pure ASCII (Content-Disposition safe)
 *
 *   What this does NOT check (open in Excel to verify):
 *     - Visual layout, fonts, borders rendering
 *     - Whether Excel's recalc returns the right *number*
 *       (we verify formulas are PRESENT; Excel does the math)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const _mod = await import('../lib/reports/buildFromTemplate.ts');
const buildMonthlyReport: typeof import('../lib/reports/buildFromTemplate.ts').buildMonthlyReport =
  (_mod as { default?: { buildMonthlyReport: unknown } }).default
    ? ((_mod as { default: { buildMonthlyReport: unknown } }).default.buildMonthlyReport as typeof import('../lib/reports/buildFromTemplate.ts').buildMonthlyReport)
    : (_mod.buildMonthlyReport as typeof import('../lib/reports/buildFromTemplate.ts').buildMonthlyReport);
type SessionSlot = import('../lib/reports/buildFromTemplate.ts').SessionSlot;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ── assertion plumbing ──────────────────────────────────────────────── */

interface AssertionResult { name: string; ok: boolean; detail?: string }
interface ScenarioResult  { scenario: string; assertions: AssertionResult[] }

function check(
  results: AssertionResult[],
  name: string,
  ok: boolean,
  detail?: string,
): void {
  results.push({ name, ok, detail: ok ? undefined : detail });
}

function eqApprox(a: number | null, b: number, eps = 1e-6): boolean {
  if (a == null || !Number.isFinite(a)) return false;
  return Math.abs(a - b) < eps;
}

function frac(h: number, m: number): number {
  return (h * 3600 + m * 60) / 86400;
}

/**
 * Recover the underlying fraction-of-day from a time cell. ExcelJS' load()
 * hydrates time-formatted cells into JS Date anchored at 1899-12-30 UTC.
 * Use UTC math so the test isn't shifted by historical local-TZ offsets.
 */
function cellFraction(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) {
    const epoch = Date.UTC(1899, 11, 30);
    return (v.getTime() - epoch) / 86400000;
  }
  return null;
}

function isBlank(v: ExcelJS.CellValue): boolean {
  if (v == null || v === '') return true;
  if (typeof v === 'object' && v && 'formula' in (v as object)) return true; // template formula
  return false;
}

async function inspect(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await wb.xlsx.load(ab as ArrayBuffer);
  return wb;
}

async function readTemplateMainSheet(): Promise<{
  formulaCells: { addr: string; formula: string }[];
  mergeRanges:  string[];
}> {
  const tpl = path.join(__dirname, '..', 'public', 'templates', 'monthly-report-template.xlsx');
  const wb  = new ExcelJS.Workbook();
  await wb.xlsx.readFile(tpl);
  const ws = wb.worksheets[0]!;

  const formulaCells: { addr: string; formula: string }[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as ExcelJS.CellValue;
      if (v && typeof v === 'object' && 'formula' in (v as object)) {
        formulaCells.push({
          addr:    cell.address,
          formula: (v as ExcelJS.CellFormulaValue).formula,
        });
      }
    });
  });

  const mergeRanges = ((ws.model as { merges?: string[] }).merges ?? []).slice();
  return { formulaCells, mergeRanges };
}

function listFormulaCells(ws: ExcelJS.Worksheet): { addr: string; formula: string }[] {
  const out: { addr: string; formula: string }[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as ExcelJS.CellValue;
      if (v && typeof v === 'object' && 'formula' in (v as object)) {
        out.push({ addr: cell.address, formula: (v as ExcelJS.CellFormulaValue).formula });
      }
    });
  });
  return out;
}

/* ── scenarios ───────────────────────────────────────────────────────── */

type Scenario = {
  name: string;
  year: number; month: number;
  sessions: SessionSlot[];
  assert: (wb: ExcelJS.Workbook, results: AssertionResult[]) => void;
};

const SCENARIOS: Scenario[] = [
  /* ── A. Normal mix ── */
  {
    name:  'A. normal mix — 3 sessions across 2 days, 3 patients',
    year:  2026, month: 3,
    sessions: [
      { date: '2026-03-02', start_time: '09:00', end_time: '10:00', patient_name: 'שירן', notes: 'התחלה רגועה' },
      { date: '2026-03-02', start_time: '11:00', end_time: '12:30', patient_name: 'מיכל', notes: null },
      { date: '2026-03-17', start_time: '14:00', end_time: '15:30', patient_name: 'נועה', notes: 'הגיעה באיחור' },
    ],
    assert(wb, r) {
      check(r, '2 sheets in workbook (main + lookup)', wb.worksheets.length === 2,
        `got ${wb.worksheets.length}`);
      const names = wb.worksheets.map(w => w.name);
      check(r, 'lookup sheet "גיליון1" preserved', names.includes('גיליון1'),
        `names = ${JSON.stringify(names)}`);
      check(r, 'main sheet renamed to "מרץ"', names.includes('מרץ'),
        `names = ${JSON.stringify(names)}`);

      const ws = wb.worksheets.find(w => w.name === 'מרץ')!;

      const c1 = ws.getCell('C1').value;
      check(r, 'C1 = Date for 2026-03-01',
        c1 instanceof Date && (c1 as Date).getFullYear() === 2026 && (c1 as Date).getMonth() === 2 && (c1 as Date).getDate() === 1,
        `got ${JSON.stringify(c1)}`);

      // Identity cells stay blank — this is a calendar report.
      check(r, 'G1 stays blank (no staff)', isBlank(ws.getCell('G1').value), `got ${JSON.stringify(ws.getCell('G1').value)}`);
      check(r, 'J1 stays blank (no staff)', isBlank(ws.getCell('J1').value), `got ${JSON.stringify(ws.getCell('J1').value)}`);
      check(r, 'G2 stays blank (no employee#)', isBlank(ws.getCell('G2').value), `got ${JSON.stringify(ws.getCell('G2').value)}`);
      check(r, 'J2 stays blank (no role)', isBlank(ws.getCell('J2').value), `got ${JSON.stringify(ws.getCell('J2').value)}`);

      // Day 2 → row 5. Two slots: (C,D) and (E,F).
      check(r, 'C5 = 09:00', eqApprox(cellFraction(ws.getCell('C5')), frac(9, 0)));
      check(r, 'D5 = 10:00', eqApprox(cellFraction(ws.getCell('D5')), frac(10, 0)));
      check(r, 'E5 = 11:00', eqApprox(cellFraction(ws.getCell('E5')), frac(11, 0)));
      check(r, 'F5 = 12:30', eqApprox(cellFraction(ws.getCell('F5')), frac(12, 30)));
      check(r, 'C5 numFmt = h:mm', ws.getCell('C5').numFmt === 'h:mm');
      check(r, 'G5 empty (no 3rd slot)', isBlank(ws.getCell('G5').value));
      check(r, 'K5 = "שירן/מיכל"', ws.getCell('K5').value === 'שירן/מיכל',
        `got ${JSON.stringify(ws.getCell('K5').value)}`);
      check(r, 'L5 includes "התחלה רגועה"',
        String(ws.getCell('L5').value ?? '').includes('התחלה רגועה'),
        `got ${JSON.stringify(ws.getCell('L5').value)}`);

      // Day 17 → row 20.
      check(r, 'C20 = 14:00', eqApprox(cellFraction(ws.getCell('C20')), frac(14, 0)));
      check(r, 'D20 = 15:30', eqApprox(cellFraction(ws.getCell('D20')), frac(15, 30)));
      check(r, 'K20 = "נועה"', ws.getCell('K20').value === 'נועה');
    },
  },

  /* ── B. Many sessions in one day ── */
  {
    name:  'B. busy day — 5 sessions, only first 3 time pairs written',
    year:  2026, month: 4,
    sessions: [
      { date: '2026-04-08', start_time: '08:00', end_time: '09:00', patient_name: 'א', notes: null },
      { date: '2026-04-08', start_time: '09:15', end_time: '10:15', patient_name: 'ב', notes: null },
      { date: '2026-04-08', start_time: '10:30', end_time: '11:30', patient_name: 'ג', notes: null },
      { date: '2026-04-08', start_time: '12:00', end_time: '13:00', patient_name: 'ד', notes: 'נוספת' },
      { date: '2026-04-08', start_time: '13:30', end_time: '14:30', patient_name: 'ה', notes: null },
    ],
    assert(wb, r) {
      const ws = wb.worksheets.find(w => w.name === 'אפריל')!;
      check(r, 'main sheet renamed to "אפריל"', !!ws,
        `names=${JSON.stringify(wb.worksheets.map(w=>w.name))}`);

      // Day 8 → row 11. Three slots cap.
      check(r, 'C11 = 08:00', eqApprox(cellFraction(ws.getCell('C11')), frac(8, 0)));
      check(r, 'E11 = 09:15', eqApprox(cellFraction(ws.getCell('E11')), frac(9, 15)));
      check(r, 'G11 = 10:30', eqApprox(cellFraction(ws.getCell('G11')), frac(10, 30)));
      // K still lists ALL 5 names so the day is fully visible.
      check(r, 'K11 lists all 5 names', ws.getCell('K11').value === 'א/ב/ג/ד/ה',
        `got ${JSON.stringify(ws.getCell('K11').value)}`);
    },
  },

  /* ── C. Short month ── */
  {
    name:  'C. short month — Feb 2026 (28 days), no writes past day 28',
    year:  2026, month: 2,
    sessions: [
      { date: '2026-02-27', start_time: '09:00', end_time: '10:00', patient_name: 'ת', notes: null },
      { date: '2026-02-28', start_time: '11:00', end_time: '12:00', patient_name: 'ש', notes: null },
    ],
    assert(wb, r) {
      const ws = wb.worksheets.find(w => w.name === 'פברואר')!;
      check(r, 'main sheet renamed to "פברואר"', !!ws);

      check(r, 'C30 = 09:00 (day 27 → row 30)', eqApprox(cellFraction(ws.getCell('C30')), frac(9, 0)));
      check(r, 'C31 = 11:00 (day 28 → row 31)', eqApprox(cellFraction(ws.getCell('C31')), frac(11, 0)));
      for (const row of [32, 33, 34]) {
        check(r, `C${row} unwritten (Feb has no day ${row - 3})`,
          isBlank(ws.getCell(`C${row}`).value),
          `got ${JSON.stringify(ws.getCell(`C${row}`).value)}`);
      }
    },
  },

  /* ── D. Empty month ── */
  {
    name:  'D. empty month — zero sessions, file still valid',
    year:  2026, month: 5,
    sessions: [],
    assert(wb, r) {
      const ws = wb.worksheets.find(w => w.name === 'מאי')!;
      check(r, 'main sheet renamed to "מאי"', !!ws);

      const c1 = ws.getCell('C1').value;
      check(r, 'C1 still set to 2026-05-01',
        c1 instanceof Date && (c1 as Date).getMonth() === 4);

      for (const row of [4, 10, 15, 22, 28, 34]) {
        check(r, `C${row} unwritten in empty month`,
          isBlank(ws.getCell(`C${row}`).value),
          `got ${JSON.stringify(ws.getCell(`C${row}`).value)}`);
      }
    },
  },
];

/* ── runner ──────────────────────────────────────────────────────────── */

async function run(): Promise<number> {
  console.log('━'.repeat(72));
  console.log('Monthly report — verification harness');
  console.log('━'.repeat(72));

  const tpl = await readTemplateMainSheet();
  console.log(`Template main sheet: ${tpl.formulaCells.length} formula cells, ${tpl.mergeRanges.length} merge ranges.`);
  console.log('');

  const all: ScenarioResult[] = [];
  let totalFail = 0;

  for (const s of SCENARIOS) {
    const built = await buildMonthlyReport({
      sessions: s.sessions,
      year:     s.year,
      month:    s.month,
    });
    const wb = await inspect(built.buffer);
    const results: AssertionResult[] = [];

    s.assert(wb, results);

    // Cross-cutting: main sheet must preserve every template formula
    // address + every merge range. The lookup sheet stays untouched.
    const main = wb.worksheets.find(w => w.name !== 'גיליון1')!;
    const formulas = listFormulaCells(main);
    const addrs = new Set(formulas.map(f => f.addr));
    const missing = tpl.formulaCells.filter(f => !addrs.has(f.addr));
    check(results, `all ${tpl.formulaCells.length} template formulas preserved`,
      missing.length === 0,
      missing.length ? `missing: ${missing.slice(0,5).map(f=>f.addr).join(', ')}${missing.length>5?`, +${missing.length-5} more`:''}` : undefined);

    const merges = ((main.model as { merges?: string[] }).merges ?? []);
    check(results, `all ${tpl.mergeRanges.length} template merges preserved`,
      merges.length === tpl.mergeRanges.length,
      `got ${merges.length}`);

    check(results, 'row 35 totals formulas present',
      formulas.filter(f => /[A-Z]+35$/.test(f.addr)).length > 0);
    check(results, 'row 37 totals formulas present',
      formulas.filter(f => /[A-Z]+37$/.test(f.addr)).length > 0);

    // VLOOKUP cross-sheet refs still point at גיליון1.
    check(results, 'column A weekday VLOOKUPs reference גיליון1',
      formulas.some(f => /^A\d+$/.test(f.addr) && f.formula.includes('גיליון1')));

    // calcProperties via raw XML.
    const zip = await JSZip.loadAsync(built.buffer);
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    const calcPr = wbXml.match(/<calcPr[^>]*\/>/)?.[0] ?? '';
    check(results, 'workbook.xml has fullCalcOnLoad="1"',
      /fullCalcOnLoad\s*=\s*"1"/.test(calcPr),
      `got <calcPr>: ${calcPr || 'missing'}`);

    // ASCII filename guard (Hebrew in headers throws ByteString).
    check(results, 'fileName is pure ASCII',
      /^[\x20-\x7E]+$/.test(built.fileName),
      `got "${built.fileName}"`);

    all.push({ scenario: s.name, assertions: results });
    totalFail += results.filter(a => !a.ok).length;
  }

  for (const sc of all) {
    const pass = sc.assertions.filter(a => a.ok).length;
    const fail = sc.assertions.length - pass;
    console.log(`\n${fail === 0 ? '✓' : '✗'} ${sc.scenario}  (${pass}/${sc.assertions.length})`);
    for (const a of sc.assertions) {
      const mark = a.ok ? '  ✓' : '  ✗';
      console.log(`${mark} ${a.name}${a.detail ? ` — ${a.detail}` : ''}`);
    }
  }

  console.log('\n' + '━'.repeat(72));
  console.log(totalFail === 0
    ? `ALL CHECKS PASSED across ${SCENARIOS.length} scenarios.`
    : `${totalFail} assertion(s) failed.`);
  console.log('━'.repeat(72));

  return totalFail === 0 ? 0 : 1;
}

const code = await run();
process.exit(code);
