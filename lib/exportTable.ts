/**
 * Generic table exporter — Excel (xlsx via ExcelJS) and PDF (jsPDF + autoTable).
 * Same Column<T> definition feeds both.
 *
 * The caller passes the array it currently displays — so any active filtering,
 * search, or sorting is naturally honored: we only see what the user sees.
 */

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import bidiFactory from 'bidi-js';

export interface Column<T> {
  header: string;
  /** Returns the cell value. Strings are rendered as text; numbers as numbers; Dates formatted. */
  accessor: (row: T) => string | number | Date | null | undefined;
  /** Optional: hint for column width in characters (Excel only). */
  width?: number;
  /** Optional: URL for this cell — rendered as an Excel hyperlink and as a
   *  clickable link annotation over the cell in the PDF. */
  link?: (row: T) => string | null | undefined;
}

export interface ExportOptions<T> {
  rows: T[];
  columns: Column<T>[];
  /** Hebrew screen title — used in PDF header and Excel sheet name. */
  title: string;
  /** ASCII slug used as filename base. e.g. "patients" → "patients-2026-05-08.xlsx". */
  fileBase: string;
  /** Optional totals line, e.g. `סה"כ: ₪1,234.00` — shown in the PDF header and
   *  appended as a bold final row in Excel. */
  summary?: string;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function pad(n: number): string { return String(n).padStart(2, '0'); }

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHuman(): string {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCell(v: string | number | Date | null | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) {
    return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`;
  }
  return String(v);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so Safari can finish the navigation
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Excel ─────────────────────────────────────────────────────────────── */

export async function exportToExcel<T>(opts: ExportOptions<T>): Promise<void> {
  const { rows, columns, title, fileBase, summary } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'מחר אחר – שדה חמד';
  wb.created = new Date();

  // Sheet name max 31 chars, no certain symbols
  const safeSheetName = title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Sheet1';
  const ws = wb.addWorksheet(safeSheetName, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  ws.columns = columns.map(c => ({
    header: c.header,
    key: c.header,
    width: c.width ?? 18,
  }));

  // Header row styling
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0D9488' },
  };
  headerRow.height = 22;

  // Data rows
  for (const row of rows) {
    const cells: Record<string, string | number | Date | null> = {};
    for (const col of columns) {
      const v = col.accessor(row);
      if (v instanceof Date) {
        cells[col.header] = v;
      } else if (typeof v === 'number') {
        cells[col.header] = v;
      } else {
        cells[col.header] = v == null ? null : String(v);
      }
    }
    const added = ws.addRow(cells);

    // Link cells become real Excel hyperlinks
    columns.forEach((col, idx) => {
      const url = col.link?.(row);
      if (!url) return;
      const text = formatCell(col.accessor(row)) || 'קישור';
      const cell = added.getCell(idx + 1);
      cell.value = { text, hyperlink: url };
      cell.font = { color: { argb: 'FF0D9488' }, underline: true };
    });
  }

  // Auto-width: widen any column whose content is longer than the default
  ws.columns.forEach((col, i) => {
    const headerLen = columns[i].header.length;
    let max = headerLen;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      const s = value instanceof Date
        ? 'DD/MM/YYYY'.length
        : value != null && typeof value === 'object' && 'text' in value
          ? String((value as { text: unknown }).text ?? '').length
          : value != null ? String(value).length : 0;
      if (s > max) max = s;
    });
    col.width = Math.min(60, Math.max(columns[i].width ?? 12, max + 2));
  });

  // Optional totals row — added after auto-width so it doesn't inflate columns
  if (summary) {
    ws.addRow({});
    const totalRow = ws.addRow({ [columns[0].header]: summary });
    totalRow.font = { bold: true };
  }

  // Date format on Date-valued cells
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value instanceof Date) {
        cell.numFmt = 'dd/mm/yyyy';
      }
      cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: false };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `${fileBase}-${todayStamp()}.xlsx`);
}

/* ── PDF ───────────────────────────────────────────────────────────────── */

let _bidi: ReturnType<typeof bidiFactory> | null = null;
function getBidi() {
  if (!_bidi) _bidi = bidiFactory();
  return _bidi;
}

/**
 * Reorder a string from logical → visual order using the Unicode Bidi Algorithm.
 * jsPDF doesn't apply BiDi, so we have to feed it pre-ordered glyphs.
 *
 * Exported so other PDF builders (e.g. the patient-card export) share the exact
 * same RTL handling instead of re-implementing it.
 */
export function visualOrder(text: string): string {
  if (!text) return '';
  const bidi = getBidi();
  const levels = bidi.getEmbeddingLevels(text, 'rtl');
  return bidi.getReorderedString(text, levels);
}

let _fontPromise: Promise<{ regular: string; bold: string }> | null = null;

/** Load + base64-encode the Alef Hebrew fonts (cached). Exported for reuse by
 *  other client-side PDF builders. */
export async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (_fontPromise) return _fontPromise;
  _fontPromise = (async () => {
    const [reg, bold] = await Promise.all([
      fetch('/fonts/Alef-Regular.ttf').then(r => {
        if (!r.ok) throw new Error('Failed to load Alef-Regular.ttf');
        return r.arrayBuffer();
      }),
      fetch('/fonts/Alef-Bold.ttf').then(r => {
        if (!r.ok) throw new Error('Failed to load Alef-Bold.ttf');
        return r.arrayBuffer();
      }),
    ]);
    return { regular: arrayBufferToBase64(reg), bold: arrayBufferToBase64(bold) };
  })();
  return _fontPromise;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Build base64 in chunks to avoid call-stack overflow on large fonts
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export async function exportToPdf<T>(opts: ExportOptions<T>): Promise<void> {
  const { rows, columns, title, fileBase, summary } = opts;

  const { regular, bold } = await loadFonts();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('Alef-Regular.ttf', regular);
  doc.addFont('Alef-Regular.ttf', 'Alef', 'normal');
  doc.addFileToVFS('Alef-Bold.ttf', bold);
  doc.addFont('Alef-Bold.ttf', 'Alef', 'bold');
  doc.setFont('Alef', 'normal');

  const pageW = doc.internal.pageSize.getWidth();

  // Header band — drawn on every page via didDrawPage hook
  const drawHeader = () => {
    doc.setFont('Alef', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(13, 148, 136); // accent
    doc.text(visualOrder(title), pageW - 32, 36, { align: 'right' });

    doc.setFont('Alef', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(visualOrder(`תאריך הפקה: ${nowHuman()}`), pageW - 32, 54, { align: 'right' });
    const leftText = summary
      ? `סה"כ רשומות: ${rows.length} · ${summary}`
      : `סה"כ רשומות: ${rows.length}`;
    doc.text(visualOrder(leftText), 32, 54, { align: 'left' });
  };

  // Build column defs in visual (right-to-left) order so the FIRST defined
  // column appears on the RIGHT, as native Hebrew tables do.
  const visualCols = [...columns].reverse();
  const head = [visualCols.map(c => visualOrder(c.header))];
  const body = rows.map(row =>
    visualCols.map(c => visualOrder(formatCell(c.accessor(row))))
  );

  // links[rowIndex][visualColIndex] — URL to lay over the cell, if any.
  const links = rows.map(row => visualCols.map(c => c.link?.(row) ?? null));
  const hasLinks = links.some(r => r.some(Boolean));

  autoTable(doc, {
    head,
    body,
    startY: 70,
    margin: { top: 70, right: 24, bottom: 36, left: 24 },
    styles: {
      font: 'Alef',
      fontStyle: 'normal',
      fontSize: 9,
      cellPadding: 5,
      halign: 'right',
      valign: 'middle',
      lineColor: [232, 236, 240],
      lineWidth: 0.5,
      textColor: [26, 35, 50],
      overflow: 'linebreak',
    },
    headStyles: {
      font: 'Alef',
      fontStyle: 'bold',
      fillColor: [13, 148, 136],
      textColor: [255, 255, 255],
      halign: 'right',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawCell: hasLinks ? (data) => {
      if (data.section !== 'body') return;
      const url = links[data.row.index]?.[data.column.index];
      if (url) {
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      }
    } : undefined,
    didDrawPage: () => {
      drawHeader();

      // Footer with page numbers
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFont('Alef', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      const totalRaw = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
      const current = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
        .getCurrentPageInfo().pageNumber;
      doc.text(
        visualOrder(`עמוד ${current} מתוך ${totalRaw}`),
        pageW / 2,
        pageH - 16,
        { align: 'center' },
      );
    },
  });

  doc.save(`${fileBase}-${todayStamp()}.pdf`);
}
