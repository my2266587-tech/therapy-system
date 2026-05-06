/**
 * Monthly hours-report Excel generator.
 * Reproduces the exact layout from the original timesheet PDF:
 *   - RTL sheet, Hebrew headers, 3 time-slot columns per day
 *   - Excel formulas for row totals and footer summaries
 *   - One worksheet per staff member
 */

import ExcelJS from 'exceljs';

/* ── types ── */

export interface SessionRow {
  date: string;       // "YYYY-MM-DD"
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  patient_name: string;
}

export interface StaffReport {
  staff_id: string;
  first_name: string;
  last_name: string;
  role: string;
  sessions: SessionRow[];
}

/* ── constants ── */

const HEB_DAYS   = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // Sun=0 … Sat=6
const HEB_MONTHS = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/** "HH:MM" → Excel fraction-of-day (0–1) */
function timeToFraction(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) / 1440;
}

/** Days in a given month (1-indexed month) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/* ── border helpers ── */
const thinBorder: ExcelJS.BorderStyle = 'thin';
const allBorders = (color = '000000'): Partial<ExcelJS.Borders> => ({
  top:    { style: thinBorder, color: { argb: color } },
  bottom: { style: thinBorder, color: { argb: color } },
  left:   { style: thinBorder, color: { argb: color } },
  right:  { style: thinBorder, color: { argb: color } },
});

/* ── main export ── */

/**
 * Build one workbook per staff member and return all buffers.
 * @param reports  Array of staff reports (one per staff member)
 * @param year     Report year
 * @param month    Report month (1–12)
 * @returns        Array of { fileName, buffer }
 */
export async function buildMonthlyReports(
  reports: StaffReport[],
  year: number,
  month: number,
): Promise<{ fileName: string; buffer: Buffer }[]> {
  const results: { fileName: string; buffer: Buffer }[] = [];

  for (const report of reports) {
    const buf = await buildSingleReport(report, year, month);
    const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
    results.push({
      fileName: `report_${monthLabel}_${report.first_name}_${report.last_name}.xlsx`,
      buffer: buf,
    });
  }

  return results;
}

async function buildSingleReport(
  report: StaffReport,
  year: number,
  month: number,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'מחר אחר – שדה חמד';

  const ws = wb.addWorksheet('דו"ח שעות', {
    views: [{ rightToLeft: true }],
  });

  /* ── column widths ── */
  ws.columns = [
    { key: 'A', width: 5  }, // יום
    { key: 'B', width: 8  }, // תאריך
    { key: 'C', width: 8  }, // from-1
    { key: 'D', width: 8  }, // to-1
    { key: 'E', width: 8  }, // from-2
    { key: 'F', width: 8  }, // to-2
    { key: 'G', width: 8  }, // from-3
    { key: 'H', width: 8  }, // to-3
    { key: 'I', width: 10 }, // סך שעות
    { key: 'J', width: 10 }, // סך לרישום
    { key: 'K', width: 30 }, // הערות
  ];

  /* ══════════════════════════════
     ROW 1 — document header
  ══════════════════════════════ */
  const r1 = ws.getRow(1);
  r1.height = 20;

  // בס"ד (K, rightmost in RTL)
  ws.getCell('K1').value  = 'בס"ד';
  ws.getCell('K1').font   = { bold: true, size: 11 };
  ws.getCell('K1').alignment = { horizontal: 'right', vertical: 'middle' };

  // חודש label + value
  ws.getCell('I1').value  = 'חודש';
  ws.getCell('I1').font   = { bold: true };
  ws.getCell('I1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('G1:H1');
  ws.getCell('G1').value  = `${HEB_MONTHS[month]} ${year}`;
  ws.getCell('G1').font   = { bold: true, size: 12 };
  ws.getCell('G1').alignment = { horizontal: 'center', vertical: 'middle' };

  // שם פרטי
  ws.getCell('F1').value  = 'שם פרטי';
  ws.getCell('F1').font   = { bold: true };
  ws.getCell('F1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('E1').value  = report.first_name;
  ws.getCell('E1').alignment = { horizontal: 'center', vertical: 'middle' };

  // משפחה
  ws.getCell('D1').value  = 'משפחה';
  ws.getCell('D1').font   = { bold: true };
  ws.getCell('D1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('C1').value  = report.last_name;
  ws.getCell('C1').alignment = { horizontal: 'center', vertical: 'middle' };

  /* ══════════════════════════════
     ROW 2 — employee info
  ══════════════════════════════ */
  const r2 = ws.getRow(2);
  r2.height = 18;

  ws.getCell('I2').value  = 'מס\' עובד';
  ws.getCell('I2').font   = { bold: true };
  ws.getCell('I2').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('F2').value  = 'תפקיד';
  ws.getCell('F2').font   = { bold: true };
  ws.getCell('F2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('E2').value  = report.role;
  ws.getCell('E2').alignment = { horizontal: 'center', vertical: 'middle' };

  /* ══════════════════════════════
     ROW 3 — column headers
  ══════════════════════════════ */
  const headerLabels: [string, string][] = [
    ['A3', 'יום'],
    ['B3', 'תאריך'],
    ['C3', 'משעה'],
    ['D3', 'עד שעה'],
    ['E3', 'משעה'],
    ['F3', 'עד שעה'],
    ['G3', 'משעה'],
    ['H3', 'עד שעה'],
    ['I3', 'סך שעות'],
    ['J3', 'סך לרישום'],
    ['K3', 'הערות'],
  ];

  for (const [addr, label] of headerLabels) {
    const cell = ws.getCell(addr);
    cell.value = label;
    cell.font  = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };
    cell.border = allBorders();
  }
  ws.getRow(3).height = 28;

  /* ══════════════════════════════
     ROWS 4..N+3 — daily data
  ══════════════════════════════ */
  const totalDays = daysInMonth(year, month);
  const DATA_START = 4;
  const DATA_END   = DATA_START + totalDays - 1; // last real day row
  const EXTRA_ROWS = 3;                           // ### overflow rows
  const EXTRA_END  = DATA_END + EXTRA_ROWS;       // last row with borders

  // Index sessions by date
  const byDate = new Map<string, SessionRow[]>();
  for (const s of report.sessions) {
    const d = s.date.slice(0, 10); // YYYY-MM-DD
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(s);
  }

  for (let day = 1; day <= totalDays; day++) {
    const excelRow = DATA_START + day - 1;
    const date     = new Date(year, month - 1, day);
    const isoDate  = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayName  = HEB_DAYS[date.getDay()];
    const dateLabel = `${day}.${month}`;
    const slots    = (byDate.get(isoDate) ?? []).slice(0, 3); // max 3

    const row = ws.getRow(excelRow);
    row.height = 16;

    // A: יום
    const cA = ws.getCell(`A${excelRow}`);
    cA.value     = dayName;
    cA.alignment = { horizontal: 'center', vertical: 'middle' };
    cA.border    = allBorders();

    // B: תאריך
    const cB = ws.getCell(`B${excelRow}`);
    cB.value     = dateLabel;
    cB.alignment = { horizontal: 'center', vertical: 'middle' };
    cB.border    = allBorders();

    // Slots C-H
    const slotCols: [string, string][] = [
      [`C${excelRow}`, `D${excelRow}`],
      [`E${excelRow}`, `F${excelRow}`],
      [`G${excelRow}`, `H${excelRow}`],
    ];

    let patientNames: string[] = [];

    for (let si = 0; si < 3; si++) {
      const [fromAddr, toAddr] = slotCols[si];
      const session = slots[si];

      const cFrom = ws.getCell(fromAddr);
      const cTo   = ws.getCell(toAddr);
      cFrom.border = allBorders();
      cTo.border   = allBorders();

      if (session) {
        cFrom.value  = timeToFraction(session.start_time);
        cFrom.numFmt = 'h:mm';
        cFrom.alignment = { horizontal: 'center', vertical: 'middle' };

        cTo.value  = timeToFraction(session.end_time);
        cTo.numFmt = 'h:mm';
        cTo.alignment = { horizontal: 'center', vertical: 'middle' };

        patientNames.push(session.patient_name);
      }
    }

    // I: total hours formula
    const cI = ws.getCell(`I${excelRow}`);
    cI.value = {
      formula: `IF(C${excelRow}<>"",D${excelRow}-C${excelRow},0)`
             + `+IF(E${excelRow}<>"",F${excelRow}-E${excelRow},0)`
             + `+IF(G${excelRow}<>"",H${excelRow}-G${excelRow},0)`,
    };
    cI.numFmt    = '[h]:mm';
    cI.alignment = { horizontal: 'center', vertical: 'middle' };
    cI.border    = allBorders();

    // J: decimal hours
    const cJ = ws.getCell(`J${excelRow}`);
    cJ.value = { formula: `I${excelRow}*24` };
    cJ.numFmt    = '0.00';
    cJ.alignment = { horizontal: 'center', vertical: 'middle' };
    cJ.border    = allBorders();

    // K: patient names
    const cK = ws.getCell(`K${excelRow}`);
    cK.value     = patientNames.join('/') || '';
    cK.alignment = { horizontal: 'right', vertical: 'middle' };
    cK.border    = allBorders();
  }

  /* ── 3 extra (###) rows ── */
  for (let ex = 1; ex <= EXTRA_ROWS; ex++) {
    const excelRow = DATA_END + ex;
    const row = ws.getRow(excelRow);
    row.height = 16;

    for (const col of ['A','B','C','D','E','F','G','H','K']) {
      const c = ws.getCell(`${col}${excelRow}`);
      c.value  = '---';
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = allBorders();
    }
    // I, J show ### (set formula so Excel renders ###)
    for (const col of ['I','J']) {
      const c = ws.getCell(`${col}${excelRow}`);
      c.value  = '---';
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = allBorders();
    }
  }

  /* ══════════════════════════════
     FOOTER ROWS
  ══════════════════════════════ */
  const TRAVEL_ROW  = EXTRA_END + 1;
  const SUBHDR_ROW  = EXTRA_END + 2;
  const TOTALS_ROW  = EXTRA_END + 3;

  const footerFill: ExcelJS.Fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFFFD700' }, // gold background for totals area
  };

  /* ── travel days row ── */
  ws.getRow(TRAVEL_ROW).height = 18;

  const cTravelLabel = ws.getCell(`K${TRAVEL_ROW}`);
  cTravelLabel.value = 'סה"כ ימים עבור נסיעות';
  cTravelLabel.font  = { bold: true, size: 9 };
  cTravelLabel.alignment = { horizontal: 'right', vertical: 'middle' };
  cTravelLabel.border = allBorders();

  // counts for slot-2 (E, F) and slot-3 (G, H)
  for (const col of ['E','F']) {
    const c = ws.getCell(`${col}${TRAVEL_ROW}`);
    c.value = { formula: `COUNTA(${col}${DATA_START}:${col}${EXTRA_END})` };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.font  = { bold: true };
    c.border = allBorders();
    c.fill  = footerFill;
  }
  for (const col of ['G','H']) {
    const c = ws.getCell(`${col}${TRAVEL_ROW}`);
    c.value = { formula: `COUNTA(${col}${DATA_START}:${col}${EXTRA_END})` };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.font  = { bold: true };
    c.border = allBorders();
    c.fill  = footerFill;
  }
  // empty borders for remaining cols
  for (const col of ['A','B','C','D','I','J']) {
    ws.getCell(`${col}${TRAVEL_ROW}`).border = allBorders();
  }

  /* ── sub-header row ── */
  ws.getRow(SUBHDR_ROW).height = 18;
  const subHdrFill: ExcelJS.Fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' },
  };
  const subHdrPairs: [string, string, string][] = [
    ['C', 'D', 'סך שעות | סך לרישום'],
    ['E', 'F', 'סך שעות | סך לרישום'],
    ['G', 'H', 'סך שעות | סך לרישום'],
    ['I', 'J', 'סך שעות | סך לרישום'],
  ];
  for (const [c1, c2] of subHdrPairs) {
    for (const col of [c1, c2]) {
      const label = col === c1 ? 'סך שעות' : 'סך לרישום';
      const cell  = ws.getCell(`${col}${SUBHDR_ROW}`);
      cell.value  = label;
      cell.font   = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders();
      cell.fill   = subHdrFill;
    }
  }
  ws.getCell(`K${SUBHDR_ROW}`).border = allBorders();
  ws.getCell(`A${SUBHDR_ROW}`).border = allBorders();
  ws.getCell(`B${SUBHDR_ROW}`).border = allBorders();

  /* ── monthly totals row ── */
  ws.getRow(TOTALS_ROW).height = 20;

  const cTotalLabel = ws.getCell(`K${TOTALS_ROW}`);
  cTotalLabel.value = 'סה"כ שעות חודשיות';
  cTotalLabel.font  = { bold: true };
  cTotalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotalLabel.border = allBorders();
  cTotalLabel.fill  = footerFill;

  // Slot 2 sub-total (E = hours, F = decimal)
  const cSlot2H = ws.getCell(`E${TOTALS_ROW}`);
  cSlot2H.value = {
    formula: `SUMPRODUCT((E${DATA_START}:E${EXTRA_END}<>"")*`
           + `(F${DATA_START}:F${EXTRA_END}-E${DATA_START}:E${EXTRA_END}))`,
  };
  cSlot2H.numFmt    = '[h]:mm';
  cSlot2H.font      = { bold: true };
  cSlot2H.alignment = { horizontal: 'center', vertical: 'middle' };
  cSlot2H.border    = allBorders();
  cSlot2H.fill      = footerFill;

  const cSlot2D = ws.getCell(`F${TOTALS_ROW}`);
  cSlot2D.value = { formula: `E${TOTALS_ROW}*24` };
  cSlot2D.numFmt    = '0.00';
  cSlot2D.font      = { bold: true };
  cSlot2D.alignment = { horizontal: 'center', vertical: 'middle' };
  cSlot2D.border    = allBorders();
  cSlot2D.fill      = footerFill;

  // Slot 3 sub-total (G = hours, H = decimal)
  const cSlot3H = ws.getCell(`G${TOTALS_ROW}`);
  cSlot3H.value = {
    formula: `SUMPRODUCT((G${DATA_START}:G${EXTRA_END}<>"")*`
           + `(H${DATA_START}:H${EXTRA_END}-G${DATA_START}:G${EXTRA_END}))`,
  };
  cSlot3H.numFmt    = '[h]:mm';
  cSlot3H.font      = { bold: true };
  cSlot3H.alignment = { horizontal: 'center', vertical: 'middle' };
  cSlot3H.border    = allBorders();
  cSlot3H.fill      = footerFill;

  const cSlot3D = ws.getCell(`H${TOTALS_ROW}`);
  cSlot3D.value = { formula: `G${TOTALS_ROW}*24` };
  cSlot3D.numFmt    = '0.00';
  cSlot3D.font      = { bold: true };
  cSlot3D.alignment = { horizontal: 'center', vertical: 'middle' };
  cSlot3D.border    = allBorders();
  cSlot3D.fill      = footerFill;

  // Grand total (I = hours, J = decimal)
  const cGrandH = ws.getCell(`I${TOTALS_ROW}`);
  cGrandH.value = { formula: `SUM(I${DATA_START}:I${EXTRA_END})` };
  cGrandH.numFmt    = '[h]:mm';
  cGrandH.font      = { bold: true };
  cGrandH.alignment = { horizontal: 'center', vertical: 'middle' };
  cGrandH.border    = allBorders();
  cGrandH.fill      = footerFill;

  const cGrandD = ws.getCell(`J${TOTALS_ROW}`);
  cGrandD.value = { formula: `I${TOTALS_ROW}*24` };
  cGrandD.numFmt    = '0.00';
  cGrandD.font      = { bold: true };
  cGrandD.alignment = { horizontal: 'center', vertical: 'middle' };
  cGrandD.border    = allBorders();
  cGrandD.fill      = footerFill;

  // Empty border cells for remaining cols in totals row
  for (const col of ['A','B','C','D']) {
    ws.getCell(`${col}${TOTALS_ROW}`).border = allBorders();
  }

  /* ── freeze panes & print settings ── */
  ws.views[0] = { rightToLeft: true, state: 'frozen', ySplit: 3, xSplit: 0 } as ExcelJS.WorksheetView;

  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
