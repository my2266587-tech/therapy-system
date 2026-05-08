/**
 * File → RawSheet { headers, rows }.
 *
 * Excel via ExcelJS (already a dependency). CSV via a small RFC-4180-ish
 * parser that handles quoted fields with embedded commas/newlines/quotes.
 *
 * Rows past the last non-empty cell are dropped, so a sheet with 500
 * empty trailing rows doesn't show up in the preview.
 */

import ExcelJS from 'exceljs';
import type { RawSheet } from './types';

function trimEmptyTrailingRows(rows: string[][]): string[][] {
  let last = rows.length - 1;
  while (last >= 0 && rows[last].every(c => !c || !String(c).trim())) last--;
  return rows.slice(0, last + 1);
}

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'object') {
    const obj = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(obj.richText)) return obj.richText.map(p => p.text).join('');
    if (obj.text != null) return String(obj.text);
    if (obj.result != null) return String(obj.result);
    return '';
  }
  return String(v);
}

/* ── Excel ─────────────────────────────────────────────────────────────── */

async function parseExcel(buffer: ArrayBuffer): Promise<RawSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    const last = row.cellCount;
    for (let c = 1; c <= last; c++) {
      cells.push(cellToString(row.getCell(c).value));
    }
    grid.push(cells);
  });

  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map(h => h.trim());
  const rows = trimEmptyTrailingRows(grid.slice(1));
  return { headers, rows };
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"')      inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r'){ /* eat */ }
      else                cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function parseCSVFile(buffer: ArrayBuffer): Promise<RawSheet> {
  // Strip optional UTF-8 BOM that Excel adds to CSV exports.
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const grid = parseCSV(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map(h => (h ?? '').trim());
  const rows = trimEmptyTrailingRows(grid.slice(1));
  return { headers, rows };
}

/* ── Public ───────────────────────────────────────────────────────────── */

export async function parseImportFile(file: File): Promise<RawSheet> {
  const buf = await file.arrayBuffer();
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return parseCSVFile(buf);
  }
  return parseExcel(buf);
}
