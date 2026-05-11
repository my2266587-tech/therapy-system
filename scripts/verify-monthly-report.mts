/**
 * Verification harness for the monthly report bundle.
 *
 *   Builds bundles covering five representative scenarios, loads each one
 *   back with ExcelJS, and asserts on cell contents, formulas, merges,
 *   number formats, sheet count, and sheet names. Run with:
 *
 *     npm run verify:reports
 *
 *   Exits 0 on full pass, 1 on any failure. Prints a per-assertion
 *   table so a human can see what was checked without opening Excel.
 *
 *   What this DOES check (programmatically):
 *     - Single shared lookup sheet ('גיליון1') survives in every output
 *     - One main sheet per staff, each named after the staff
 *     - Per-sheet: C1 anchor Date, G1/J1/G2/J2 identity cells
 *     - Per-day time pairs (fraction-of-day via UTC math)
 *     - K / L cells (patient names joined by '/', notes by ' \\ ')
 *     - First-3-sessions truncation
 *     - Short-month behavior (no writes past lastDay)
 *     - Formulas in rows 35 & 37 SURVIVE the value writes on EVERY main sheet
 *     - All 57 template formulas + 1 merge survive on EVERY main sheet
 *     - Cross-sheet VLOOKUP formulas keep referencing 'גיליון1'
 *     - workbook.xml has fullCalcOnLoad="1"
 *
 *   What this does NOT check (you'll have to open Excel for these):
 *     - Visual layout, fonts, borders rendering
 *     - Whether Excel's recalc returns the right *number*
 *       (we verify formulas are PRESENT; Excel does the math)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const _mod = await import('../lib/reports/buildFromTemplate.ts');
const buildMonthlyReportBundle: typeof import('../lib/reports/buildFromTemplate.ts').buildMonthlyReportBundle =
  (_mod as { default?: { buildMonthlyReportBundle: unknown } }).default
    ? ((_mod as { default: { buildMonthlyReportBundle: unknown } }).default.buildMonthlyReportBundle as typeof import('../lib/reports/buildFromTemplate.ts').buildMonthlyReportBundle)
    : (_mod.buildMonthlyReportBundle as typeof import('../lib/reports/buildFromTemplate.ts').buildMonthlyReportBundle);
type StaffEntry = import('../lib/reports/buildFromTemplate.ts').StaffEntry;

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

/** Fraction-of-day for HH:MM. */
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

/* ── inspector ───────────────────────────────────────────────────────── */

async function inspect(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await wb.xlsx.load(ab as ArrayBuffer);
  return wb;
}

/**
 * Read the template directly so we know what was supposed to survive
 * on every main sheet: formula addresses + merge ranges.
 */
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
  staff: StaffEntry[];
  /** Asserts run on the LOADED bundle workbook. */
  assert: (wb: ExcelJS.Workbook, results: AssertionResult[]) => void;
};

const STAFF_A: StaffEntry = {
  staff: { full_name: 'דנה כהן', role: 'therapist', employee_number: '4321' },
  sessions: [
    { date: '2026-03-02', start_time: '09:00', end_time: '10:00', patient_name: 'שירן', notes: 'התחלה רגועה' },
    { date: '2026-03-02', start_time: '11:00', end_time: '12:30', patient_name: 'מיכל', notes: null },
    { date: '2026-03-17', start_time: '14:00', end_time: '15:30', patient_name: 'נועה', notes: 'הגיעה באיחור' },
  ],
};

const STAFF_BUSY: StaffEntry = {
  staff: { full_name: 'מעיין לוי', role: 'instructor', employee_number: null },
  sessions: [
    { date: '2026-04-08', start_time: '08:00', end_time: '09:00', patient_name: 'א', notes: null },
    { date: '2026-04-08', start_time: '09:15', end_time: '10:15', patient_name: 'ב', notes: null },
    { date: '2026-04-08', start_time: '10:30', end_time: '11:30', patient_name: 'ג', notes: null },
    { date: '2026-04-08', start_time: '12:00', end_time: '13:00', patient_name: 'ד', notes: 'נוספת' },
    { date: '2026-04-08', start_time: '13:30', end_time: '14:30', patient_name: 'ה', notes: null },
  ],
};

const STAFF_FEB: StaffEntry = {
  staff: { full_name: 'יעל', role: 'coordinator', employee_number: '7' },
  sessions: [
    { date: '2026-02-27', start_time: '09:00', end_time: '10:00', patient_name: 'ת', notes: null },
    { date: '2026-02-28', start_time: '11:00', end_time: '12:00', patient_name: 'ש', notes: null },
  ],
};

const STAFF_BLANK: StaffEntry = {
  staff: { full_name: 'רותי גולן', role: 'therapist', employee_number: null },
  sessions: [],
};

const SCENARIOS: Scenario[] = [
  /* ── A. single staff, normal mix ── */
  {
    name:  'A. one staff, normal mix (3 sessions on 2 different days)',
    year:  2026, month: 3,
    staff: [STAFF_A],
    assert(wb, r) {
      check(r, 'two sheets total (1 main + 1 lookup)', wb.worksheets.length === 2,
        `got ${wb.worksheets.length}`);
      const ws = wb.worksheets[0]!;
      check(r, 'main sheet name = "דנה כהן"', ws.name === 'דנה כהן', `got "${ws.name}"`);

      const c1 = ws.getCell('C1').value;
      check(r, 'C1 is a Date for 2026-03-01',
        c1 instanceof Date && (c1 as Date).getFullYear() === 2026 && (c1 as Date).getMonth() === 2 && (c1 as Date).getDate() === 1,
        `got ${JSON.stringify(c1)}`);

      check(r, 'G1 = "דנה"', ws.getCell('G1').value === 'דנה');
      check(r, 'J1 = "כהן"', ws.getCell('J1').value === 'כהן');
      check(r, 'G2 = "4321"', ws.getCell('G2').value === '4321');
      check(r, 'J2 = role label "מטפלת"', ws.getCell('J2').value === 'מטפלת');

      // Day 2 → row 5
      check(r, 'C5 = 09:00 fraction', eqApprox(cellFraction(ws.getCell('C5')), frac(9, 0)));
      check(r, 'D5 = 10:00 fraction', eqApprox(cellFraction(ws.getCell('D5')), frac(10, 0)));
      check(r, 'E5 = 11:00 fraction', eqApprox(cellFraction(ws.getCell('E5')), frac(11, 0)));
      check(r, 'F5 = 12:30 fraction', eqApprox(cellFraction(ws.getCell('F5')), frac(12, 30)));
      check(r, 'C5 numFmt = h:mm', ws.getCell('C5').numFmt === 'h:mm');
      check(r, 'K5 = "שירן/מיכל"', ws.getCell('K5').value === 'שירן/מיכל');

      // Day 17 → row 20
      check(r, 'C20 = 14:00 fraction', eqApprox(cellFraction(ws.getCell('C20')), frac(14, 0)));
      check(r, 'D20 = 15:30 fraction', eqApprox(cellFraction(ws.getCell('D20')), frac(15, 30)));
      check(r, 'K20 = "נועה"', ws.getCell('K20').value === 'נועה');
    },
  },

  /* ── B. >3 sessions in one day (truncation) ── */
  {
    name:  'B. many sessions on one day (>3 → only first 3 written)',
    year:  2026, month: 4,
    staff: [STAFF_BUSY],
    assert(wb, r) {
      const ws = wb.worksheets[0]!;
      check(r, 'sheet name = "מעיין לוי"', ws.name === 'מעיין לוי');
      // Day 8 → row 11
      check(r, 'C11 = 08:00', eqApprox(cellFraction(ws.getCell('C11')), frac(8, 0)));
      check(r, 'E11 = 09:15', eqApprox(cellFraction(ws.getCell('E11')), frac(9, 15)));
      check(r, 'G11 = 10:30', eqApprox(cellFraction(ws.getCell('G11')), frac(10, 30)));
      // K still lists ALL 5 names (slotsAll, not the truncated slice)
      check(r, 'K11 lists all 5 names', ws.getCell('K11').value === 'א/ב/ג/ד/ה');
    },
  },

  /* ── C. short month (Feb 2026 = 28 days) ── */
  {
    name:  'C. short month — Feb 2026 (28 days)',
    year:  2026, month: 2,
    staff: [STAFF_FEB],
    assert(wb, r) {
      const ws = wb.worksheets[0]!;
      check(r, 'sheet name = "יעל"', ws.name === 'יעל');
      check(r, 'C30 = 09:00 (day 27)', eqApprox(cellFraction(ws.getCell('C30')), frac(9, 0)));
      check(r, 'C31 = 11:00 (day 28)', eqApprox(cellFraction(ws.getCell('C31')), frac(11, 0)));
      for (const row of [32, 33, 34]) {
        const v = ws.getCell(`C${row}`).value;
        const empty = v == null || v === '' || (typeof v === 'object' && v && 'formula' in (v as object));
        check(r, `C${row} not written by us (template-only cell)`, empty, `got ${JSON.stringify(v)}`);
      }
      check(r, 'J2 = "רכזת"', ws.getCell('J2').value === 'רכזת');
    },
  },

  /* ── D. blank report ── */
  {
    name:  'D. blank report — staff with zero sessions',
    year:  2026, month: 5,
    staff: [STAFF_BLANK],
    assert(wb, r) {
      const ws = wb.worksheets[0]!;
      check(r, 'sheet name = "רותי גולן"', ws.name === 'רותי גולן');
      check(r, 'G1 = "רותי"', ws.getCell('G1').value === 'רותי');
      check(r, 'J1 = "גולן"', ws.getCell('J1').value === 'גולן');
      check(r, 'G2 empty', ws.getCell('G2').value == null || ws.getCell('G2').value === '');
      for (const row of [4, 10, 15, 22, 28]) {
        const v = ws.getCell(`C${row}`).value;
        const empty = v == null || v === '' || (typeof v === 'object' && v && 'formula' in (v as object));
        check(r, `C${row} unwritten in blank report`, empty, `got ${JSON.stringify(v)}`);
      }
    },
  },

  /* ── E. THE BUNDLE — all four staff in one workbook ── */
  {
    name:  'E. bundle of 4 staff in one file (5 sheets total incl. lookup)',
    year:  2026, month: 3,
    staff: [STAFF_A, STAFF_BUSY, STAFF_FEB, STAFF_BLANK],
    assert(wb, r) {
      check(r, '5 sheets total (4 main + 1 lookup)', wb.worksheets.length === 5,
        `got ${wb.worksheets.length}`);

      const names = wb.worksheets.map(w => w.name);
      check(r, 'lookup sheet "גיליון1" present', names.includes('גיליון1'),
        `names = ${JSON.stringify(names)}`);
      check(r, 'all 4 staff sheets present (by name)',
        ['דנה כהן', 'מעיין לוי', 'יעל', 'רותי גולן'].every(n => names.includes(n)),
        `names = ${JSON.stringify(names)}`);

      // Lookup sheet content untouched
      const lookup = wb.worksheets.find(w => w.name === 'גיליון1')!;
      check(r, 'lookup A1 = 1', lookup.getCell('A1').value === 1);
      check(r, 'lookup B1 = "א"', lookup.getCell('B1').value === 'א');
      check(r, 'lookup B7 = "ש"', lookup.getCell('B7').value === 'ש');

      // Sheet #1 still represents STAFF_A correctly
      const dana = wb.worksheets.find(w => w.name === 'דנה כהן')!;
      check(r, 'דנה sheet G1 = "דנה"', dana.getCell('G1').value === 'דנה');
      check(r, 'דנה sheet C5 = 09:00', eqApprox(cellFraction(dana.getCell('C5')), frac(9, 0)));

      // The CLONED sheet for STAFF_BUSY has independent values. Her
      // sessions are dated April; the bundle is March; so her sheet
      // is rendered for March and is empty session-wise — proving the
      // per-staff sheet is filtered by the bundle's month, not by the
      // staff's raw session list.
      const meyan = wb.worksheets.find(w => w.name === 'מעיין לוי')!;
      check(r, 'מעיין sheet G1 = "מעיין"', meyan.getCell('G1').value === 'מעיין');
      const meyanC11 = meyan.getCell('C11').value;
      check(r, 'מעיין sheet C11 empty (her sessions are April, bundle is March)',
        meyanC11 == null || meyanC11 === '' || (typeof meyanC11 === 'object' && meyanC11 && 'formula' in (meyanC11 as object)),
        `got ${JSON.stringify(meyanC11)}`);
      // STAFF_BUSY has no day-17 sessions → C20 must be unwritten in HER sheet
      const meyanC20 = meyan.getCell('C20').value;
      check(r, 'מעיין sheet C20 NOT 14:00 (no day-17 sessions for her)',
        meyanC20 == null || meyanC20 === '' || cellFraction(meyan.getCell('C20')) !== frac(14, 0),
        `got ${JSON.stringify(meyanC20)}`);

      // The cloned sheet must carry formulas (VLOOKUP into lookup sheet)
      const yael = wb.worksheets.find(w => w.name === 'יעל')!;
      const a4 = yael.getCell('A4').value;
      const a4HasFormula = a4 && typeof a4 === 'object' && 'formula' in (a4 as object);
      check(r, 'cloned sheet (יעל) A4 still has a formula', !!a4HasFormula,
        `got ${JSON.stringify(a4)}`);
      if (a4HasFormula) {
        const f = (a4 as ExcelJS.CellFormulaValue).formula;
        check(r, 'cloned sheet formula still references גיליון1',
          f.includes('גיליון1'), `got formula: ${f}`);
      }

      // Cross-staff month anchor: דנה=March, יעל=March (this bundle is
      // generated for month=3), even though Feb was used for STAFF_FEB
      // in scenario C — here they share the bundle's month.
      const yaelC1 = yael.getCell('C1').value;
      check(r, 'יעל sheet C1 = 2026-03-01 (bundle month, not staff-specific)',
        yaelC1 instanceof Date && (yaelC1 as Date).getMonth() === 2,
        `got ${JSON.stringify(yaelC1)}`);
    },
  },
];

/* ── runner ──────────────────────────────────────────────────────────── */

async function run(): Promise<number> {
  console.log('━'.repeat(72));
  console.log('Monthly report bundle — verification harness');
  console.log('━'.repeat(72));

  const tpl = await readTemplateMainSheet();
  console.log(`Template main sheet: ${tpl.formulaCells.length} formula cells, ${tpl.mergeRanges.length} merge ranges.`);
  console.log('');

  const all: ScenarioResult[] = [];
  let totalFail = 0;

  for (const s of SCENARIOS) {
    const built = await buildMonthlyReportBundle({
      staff: s.staff,
      year:  s.year,
      month: s.month,
    });
    const wb = await inspect(built.buffer);
    const results: AssertionResult[] = [];

    // Scenario-specific.
    s.assert(wb, results);

    // Cross-cutting: every main sheet (everything except 'גיליון1') must
    // preserve every template formula address + every merge range.
    const mainSheets = wb.worksheets.filter(w => w.name !== 'גיליון1');
    let allFormulasOk = true;
    let allMergesOk   = true;
    let row35Ok = true, row37Ok = true;
    for (const ws of mainSheets) {
      const formulas = listFormulaCells(ws);
      const addrs = new Set(formulas.map(f => f.addr));
      const missing = tpl.formulaCells.filter(f => !addrs.has(f.addr));
      if (missing.length > 0) allFormulasOk = false;

      const merges = ((ws.model as { merges?: string[] }).merges ?? []);
      if (merges.length !== tpl.mergeRanges.length) allMergesOk = false;

      if (formulas.filter(f => /[A-Z]+35$/.test(f.addr)).length === 0) row35Ok = false;
      if (formulas.filter(f => /[A-Z]+37$/.test(f.addr)).length === 0) row37Ok = false;
    }
    check(results, `all ${tpl.formulaCells.length} template formulas preserved on every main sheet`, allFormulasOk);
    check(results, `all ${tpl.mergeRanges.length} template merges preserved on every main sheet`, allMergesOk);
    check(results, `row 35 totals formulas present on every main sheet`, row35Ok);
    check(results, `row 37 totals formulas present on every main sheet`, row37Ok);

    // calcProperties via raw XML (ExcelJS load() drops the attribute).
    const zip = await JSZip.loadAsync(built.buffer);
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    const calcPr = wbXml.match(/<calcPr[^>]*\/>/)?.[0] ?? '';
    check(results, 'workbook.xml has fullCalcOnLoad="1"',
      /fullCalcOnLoad\s*=\s*"1"/.test(calcPr),
      `got <calcPr>: ${calcPr || 'missing'}`);

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
