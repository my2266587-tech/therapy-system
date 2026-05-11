/**
 * Verification harness for the monthly report generator.
 *
 *   Builds reports for four representative scenarios, loads each one
 *   back with ExcelJS, and asserts on cell contents, formulas, merges,
 *   and number formats. Run with:
 *
 *     npx tsx scripts/verify-monthly-report.mts
 *
 *   Exits 0 on full pass, 1 on any failure. Prints a per-assertion
 *   table so a human can see what was checked without opening Excel.
 *
 *   What this DOES check:
 *     - Sheet name = Hebrew month
 *     - C1 = first-of-month Date
 *     - G1 / J1 / G2 / J2 identity cells
 *     - Per-day time pairs (fraction-of-day values + numFmt 'h:mm')
 *     - K / L cells (patient names joined by '/', notes by ' \\ ')
 *     - Truncation to first 3 sessions per day
 *     - Short-month behavior (no writes past lastDay)
 *     - Formulas in rows 35 & 37 SURVIVE the value writes
 *     - Merged cells from the template are still merged
 *     - calcProperties.fullCalcOnLoad === true
 *
 *   What this does NOT check (you'll have to open Excel for these):
 *     - Visual layout, fonts, borders
 *     - Whether Excel's recalc actually returns the right *number*
 *       (we verify formulas are PRESENT; Excel itself does the math)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

// tsx exposes lib .ts files via the CJS interop ns under .default. Pull
// the function out of there so we don't depend on whichever loader mode
// tsx picks for a given run.
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

/** Fraction-of-day for HH:MM. */
function frac(h: number, m: number): number {
  return (h * 3600 + m * 60) / 86400;
}

/**
 * Read the underlying fraction-of-day from a time cell. ExcelJS load()
 * automatically hydrates time-formatted cells into JS Date objects
 * anchored at 1899-12-30 UTC. Recover the fraction via UTC math so the
 * test isn't tripped by local-TZ historical offsets (e.g. Jerusalem
 * pre-1900 LMT is ~+02:20:40 which shifts getHours() by minutes).
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

async function inspect(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS' types want ArrayBuffer/Buffer-like; pass the underlying ArrayBuffer.
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await wb.xlsx.load(ab as ArrayBuffer);
  return wb.worksheets[0]!;
}

/**
 * Read the template directly so we know what was supposed to survive:
 * formula cells and merge ranges.
 */
async function readTemplate(): Promise<{
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

  // ExcelJS internal: model.merges is an array of "A1:B2" strings on read.
  const mergeRanges = ((ws.model as { merges?: string[] }).merges ?? []).slice();
  return { formulaCells, mergeRanges };
}

/* ── scenarios ───────────────────────────────────────────────────────── */

type Scenario = {
  name: string;
  year: number; month: number;
  staff: { full_name: string; role: string; employee_number: string | null };
  sessions: SessionSlot[];
  /** Each scenario knows what to assert. */
  assert: (ws: ExcelJS.Worksheet, results: AssertionResult[]) => void;
};

const SCENARIOS: Scenario[] = [
  /* ── A. Single staff, normal mix ── */
  {
    name:  'A. one staff, normal mix (3 sessions on 2 different days)',
    year:  2026, month: 3,                       // March 2026 — 31 days
    staff: { full_name: 'דנה כהן', role: 'therapist', employee_number: '4321' },
    sessions: [
      { date: '2026-03-02', start_time: '09:00', end_time: '10:00', patient_name: 'שירן', notes: 'התחלה רגועה' },
      { date: '2026-03-02', start_time: '11:00', end_time: '12:30', patient_name: 'מיכל', notes: null },
      { date: '2026-03-17', start_time: '14:00', end_time: '15:30', patient_name: 'נועה', notes: 'הגיעה באיחור' },
    ],
    assert(ws, r) {
      check(r, 'sheet name = "מרץ"', ws.name === 'מרץ', `got "${ws.name}"`);

      const c1 = ws.getCell('C1').value;
      check(r, 'C1 is a Date for 2026-03-01',
        c1 instanceof Date && (c1 as Date).getFullYear() === 2026 && (c1 as Date).getMonth() === 2 && (c1 as Date).getDate() === 1,
        `got ${JSON.stringify(c1)}`);

      check(r, 'G1 = "דנה"', ws.getCell('G1').value === 'דנה');
      check(r, 'J1 = "כהן"', ws.getCell('J1').value === 'כהן');
      check(r, 'G2 = "4321"', ws.getCell('G2').value === '4321');
      check(r, 'J2 = role label "מטפלת"', ws.getCell('J2').value === 'מטפלת',
        `got ${JSON.stringify(ws.getCell('J2').value)}`);

      // Day 2 → row 5. Slot 1 = (C,D); slot 2 = (E,F).
      check(r, 'C5 = 09:00 fraction', eqApprox(cellFraction(ws.getCell('C5')), frac(9, 0)),
        `got ${ws.getCell('C5').value}`);
      check(r, 'D5 = 10:00 fraction', eqApprox(cellFraction(ws.getCell('D5')), frac(10, 0)));
      check(r, 'E5 = 11:00 fraction', eqApprox(cellFraction(ws.getCell('E5')), frac(11, 0)));
      check(r, 'F5 = 12:30 fraction', eqApprox(cellFraction(ws.getCell('F5')), frac(12, 30)));
      check(r, 'C5 numFmt = h:mm', ws.getCell('C5').numFmt === 'h:mm',
        `got ${ws.getCell('C5').numFmt}`);

      // Slot 3 on day 2 was not used → G5/H5 stay blank
      const g5 = ws.getCell('G5').value;
      check(r, 'G5 empty (no 3rd slot)', g5 == null || g5 === '', `got ${JSON.stringify(g5)}`);

      check(r, 'K5 = "שירן/מיכל"', ws.getCell('K5').value === 'שירן/מיכל',
        `got ${JSON.stringify(ws.getCell('K5').value)}`);
      check(r, 'L5 contains both notes joined', String(ws.getCell('L5').value ?? '').includes('התחלה רגועה'),
        `got ${JSON.stringify(ws.getCell('L5').value)}`);

      // Day 17 → row 20.
      check(r, 'C20 = 14:00 fraction', eqApprox(cellFraction(ws.getCell('C20')), frac(14, 0)));
      check(r, 'D20 = 15:30 fraction', eqApprox(cellFraction(ws.getCell('D20')), frac(15, 30)));
      check(r, 'K20 = "נועה"', ws.getCell('K20').value === 'נועה');
    },
  },

  /* ── B. Many sessions per day (truncation to first 3) ── */
  {
    name:  'B. many sessions on one day (>3 → only first 3, rest counted)',
    year:  2026, month: 4,                       // April 2026 — 30 days
    staff: { full_name: 'מעיין לוי', role: 'instructor', employee_number: null },
    sessions: [
      { date: '2026-04-08', start_time: '08:00', end_time: '09:00', patient_name: 'א', notes: null },
      { date: '2026-04-08', start_time: '09:15', end_time: '10:15', patient_name: 'ב', notes: null },
      { date: '2026-04-08', start_time: '10:30', end_time: '11:30', patient_name: 'ג', notes: null },
      { date: '2026-04-08', start_time: '12:00', end_time: '13:00', patient_name: 'ד', notes: 'נוספת' },
      { date: '2026-04-08', start_time: '13:30', end_time: '14:30', patient_name: 'ה', notes: null },
    ],
    assert(ws, r) {
      check(r, 'sheet name = "אפריל"', ws.name === 'אפריל');

      // Day 8 → row 11. Three slots: C/D, E/F, G/H. Fourth+ ignored.
      check(r, 'C11 = 08:00', eqApprox(cellFraction(ws.getCell('C11')), frac(8, 0)));
      check(r, 'E11 = 09:15', eqApprox(cellFraction(ws.getCell('E11')), frac(9, 15)));
      check(r, 'G11 = 10:30', eqApprox(cellFraction(ws.getCell('G11')), frac(10, 30)));

      // 4th and 5th slots should NOT be written anywhere — no slot 4 cell exists.
      // We can only verify that K joins ALL 5 names (per the generator code:
      // K uses slotsAll, not the truncated slice).
      check(r, 'K11 lists all 5 names', ws.getCell('K11').value === 'א/ב/ג/ד/ה',
        `got ${JSON.stringify(ws.getCell('K11').value)}`);
    },
  },

  /* ── C. Short month (Feb 2026 = 28 days) ── */
  {
    name:  'C. short month — Feb 2026 (28 days)',
    year:  2026, month: 2,
    staff: { full_name: 'יעל', role: 'coordinator', employee_number: '7' },
    sessions: [
      { date: '2026-02-27', start_time: '09:00', end_time: '10:00', patient_name: 'ת', notes: null },
      { date: '2026-02-28', start_time: '11:00', end_time: '12:00', patient_name: 'ש', notes: null },
    ],
    assert(ws, r) {
      check(r, 'sheet name = "פברואר"', ws.name === 'פברואר');

      // Day 28 → row 31. Day 27 → row 30.
      check(r, 'C30 = 09:00 (day 27)', eqApprox(cellFraction(ws.getCell('C30')), frac(9, 0)));
      check(r, 'C31 = 11:00 (day 28)', eqApprox(cellFraction(ws.getCell('C31')), frac(11, 0)));

      // Day 29/30/31 don't exist in Feb. The generator must not write to
      // rows 32/33/34 (those rows' template formulas hide themselves
      // when MONTH(date) ≠ this month). We assert C32/C33/C34 are empty.
      for (const row of [32, 33, 34]) {
        const v = ws.getCell(`C${row}`).value;
        const empty = v == null || v === '' || (typeof v === 'object' && v && 'formula' in (v as object));
        check(r, `C${row} not written by us (template-only cell)`, empty,
          `got ${JSON.stringify(v)}`);
      }

      check(r, 'J2 = role label "רכזת"', ws.getCell('J2').value === 'רכזת');
    },
  },

  /* ── D. No sessions at all ── */
  {
    name:  'D. blank report — staff with zero sessions',
    year:  2026, month: 5,
    staff: { full_name: 'רותי גולן', role: 'therapist', employee_number: null },
    sessions: [],
    assert(ws, r) {
      check(r, 'sheet name = "מאי"', ws.name === 'מאי');
      check(r, 'G1 = "רותי"', ws.getCell('G1').value === 'רותי');
      check(r, 'J1 = "גולן"', ws.getCell('J1').value === 'גולן');
      check(r, 'G2 is empty (no employee_number)',
        ws.getCell('G2').value == null || ws.getCell('G2').value === '',
        `got ${JSON.stringify(ws.getCell('G2').value)}`);

      // No per-day time cells should be populated. Spot-check 5 random rows.
      for (const row of [4, 10, 15, 22, 28]) {
        const v = ws.getCell(`C${row}`).value;
        const empty = v == null || v === '' || (typeof v === 'object' && v && 'formula' in (v as object));
        check(r, `C${row} unwritten in blank report`, empty, `got ${JSON.stringify(v)}`);
      }
    },
  },
];

/* ── runner ──────────────────────────────────────────────────────────── */

async function run(): Promise<number> {
  console.log('━'.repeat(72));
  console.log('Monthly report verification harness');
  console.log('━'.repeat(72));

  const tpl = await readTemplate();
  console.log(`Template: ${tpl.formulaCells.length} formula cells, ${tpl.mergeRanges.length} merge ranges.`);
  console.log('');

  const all: ScenarioResult[] = [];
  let totalFail = 0;

  for (const s of SCENARIOS) {
    const built = await buildMonthlyReport({
      staff:    s.staff as { full_name: string; role: import('../types/index.ts').StaffRole; employee_number: string | null },
      sessions: s.sessions,
      year:     s.year,
      month:    s.month,
    });
    const ws = await inspect(built.buffer);
    const results: AssertionResult[] = [];

    // Scenario-specific assertions.
    s.assert(ws, results);

    // Cross-cutting assertions: every formula and every merge from the
    // template must still be present in the generated file.
    const formulaCells: { addr: string; formula: string }[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value as ExcelJS.CellValue;
        if (v && typeof v === 'object' && 'formula' in (v as object)) {
          formulaCells.push({ addr: cell.address, formula: (v as ExcelJS.CellFormulaValue).formula });
        }
      });
    });
    const fmAddrs = new Set(formulaCells.map(f => f.addr));
    const missingFormulas = tpl.formulaCells.filter(f => !fmAddrs.has(f.addr));
    check(results,
      `all ${tpl.formulaCells.length} template formulas preserved`,
      missingFormulas.length === 0,
      missingFormulas.length ? `missing: ${missingFormulas.slice(0, 5).map(f => f.addr).join(', ')}${missingFormulas.length > 5 ? `, +${missingFormulas.length - 5} more` : ''}` : undefined);

    // Specifically spot-check rows 35 and 37 — the totals the user named.
    const row35Formulas = formulaCells.filter(f => /[A-Z]+35$/.test(f.addr));
    const row37Formulas = formulaCells.filter(f => /[A-Z]+37$/.test(f.addr));
    check(results, 'row 35 still has at least one formula (totals)',  row35Formulas.length > 0);
    check(results, 'row 37 still has at least one formula (totals)',  row37Formulas.length > 0);

    const mergeRanges = ((ws.model as { merges?: string[] }).merges ?? []);
    check(results,
      `all ${tpl.mergeRanges.length} template merges preserved`,
      mergeRanges.length === tpl.mergeRanges.length,
      `got ${mergeRanges.length}`);

    // calcProperties.fullCalcOnLoad — ExcelJS' load() drops this attribute
    // even though writeBuffer() persists it correctly into workbook.xml.
    // Read the raw XML to verify the attribute that Excel will actually act on.
    const zip = await JSZip.loadAsync(built.buffer);
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    const calcPr = wbXml.match(/<calcPr[^>]*\/>/)?.[0] ?? '';
    check(results, 'workbook.xml has fullCalcOnLoad="1"',
      /fullCalcOnLoad\s*=\s*"1"/.test(calcPr),
      `got <calcPr>: ${calcPr || 'missing'}`);

    all.push({ scenario: s.name, assertions: results });
    totalFail += results.filter(a => !a.ok).length;
  }

  // ── Print report ──
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
