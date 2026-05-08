/**
 * File → RawSheet { headers, rows }.
 *
 * Excel via ExcelJS. CSV via PapaParse (5.x) — RFC-4180-compliant, handles
 * multiline quoted fields, escaped quotes, mixed line endings, and BOMs.
 *
 * Why we don't roll our own CSV anymore: a real CSV file from the field had
 * a multiline cell — שדה "הערות" with a paragraph — which the inline parser
 * mishandled, spilling the rest of the line's content into the next field.
 * PapaParse is battle-tested for exactly this.
 *
 * Auto-detect: PapaParse picks the delimiter (',' ';' '\t' '|') by
 * sampling the first chunk. We also strip BOMs, normalize line endings
 * inside each cell, and remove zero-width/invisible characters that often
 * sneak in from copy-paste.
 *
 * Empty trailing rows are trimmed so a sheet with 500 blank rows at the
 * bottom doesn't show up in the preview.
 */

import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { RawSheet } from './types';

/* ── 1. Cell sanitation ─────────────────────────────────────────────── */

/**
 * Clean a single cell: remove invisible Unicode garbage, normalize line
 * endings, collapse trailing whitespace. Multi-line content (real
 * paragraphs in a "notes" column) is preserved — only the cosmetic noise
 * is removed.
 *
 * Characters stripped:
 *   - Zero-width: ZWSP (U+200B), ZWNJ (U+200C), ZWJ (U+200D), BOM (U+FEFF)
 *   - LRM/RLM marks (U+200E/F) — they break exact-match comparison silently
 *   - Other format chars in the U+2060–U+206F block
 */
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE = /[​‌‍‎‏⁠-⁯﻿]/g;

function sanitizeCell(v: string): string {
  return v
    .replace(/\r\n?/g, '\n')      // CRLF / CR → LF
    .replace(INVISIBLE, '')       // ZWSP / ZWNJ / ZWJ / LRM / RLM / format chars / BOM
    .replace(/[ \t]+\n/g, '\n')   // trailing tabs/spaces before LF
    .trim();
}

function trimEmptyTrailingRows(rows: string[][]): string[][] {
  let last = rows.length - 1;
  while (last >= 0 && rows[last].every(c => !c || !c.trim())) last--;
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

/* ── 2. Excel ───────────────────────────────────────────────────────── */

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
      cells.push(sanitizeCell(cellToString(row.getCell(c).value)));
    }
    grid.push(cells);
  });

  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map(h => h.trim());
  const rows = trimEmptyTrailingRows(grid.slice(1));
  return { headers, rows };
}

/* ── 3. CSV via PapaParse ───────────────────────────────────────────── */

/**
 * UTF-8 + BOM stripping. CSV files exported from Excel on Windows often
 * carry a UTF-8 BOM (EF BB BF) at the front; PapaParse handles it but we
 * strip explicitly so downstream string ops don't see U+FEFF as a char.
 */
function decodeUtf8(buffer: ArrayBuffer): string {
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text;
}

function parseCSVText(text: string): RawSheet {
  // PapaParse with delimiter auto-detection, multiline-aware quote handling,
  // mixed-EOL safe. We let Papa pick delimiter (it samples the first chunk
  // and scores all of `, ; \t |`). dynamicTyping=false keeps everything as
  // strings — we want raw text into our own coercers.
  const result = Papa.parse<string[]>(text, {
    delimiter:           '',           // empty = auto-detect among , ; \t |
    skipEmptyLines:      'greedy',     // skips both blank rows and whitespace-only rows
    quoteChar:           '"',
    escapeChar:          '"',
    // newline is auto-detected when omitted (mixed CRLF/LF/CR all handled)
    dynamicTyping:       false,
    header:              false,
    transform:           sanitizeCell, // each cell goes through sanitation
  });

  const grid = (result.data ?? []) as string[][];
  if (grid.length === 0) return { headers: [], rows: [] };

  // PapaParse gives uneven row widths when the source has them; pad short
  // rows to the header width so the column-by-index mapping doesn't drift.
  const headers = grid[0].map(h => (h ?? '').trim());
  const width   = headers.length;
  const body    = grid.slice(1).map(r => {
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push('');
    return padded;
  });

  return { headers, rows: trimEmptyTrailingRows(body) };
}

async function parseCSVFile(buffer: ArrayBuffer): Promise<RawSheet> {
  return parseCSVText(decodeUtf8(buffer));
}

/* ── 4. Public ───────────────────────────────────────────────────────── */

export async function parseImportFile(file: File): Promise<RawSheet> {
  const buf = await file.arrayBuffer();
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return parseCSVFile(buf);
  }
  return parseExcel(buf);
}
