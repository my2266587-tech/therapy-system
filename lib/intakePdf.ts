/**
 * Intake-form PDF builder ("טופס הצטרפות").
 *
 * Builds a single, portrait-A4, fully RTL Hebrew PDF summarising one submitted
 * intake form and RETURNS it as a Blob (the caller uploads it; we never call
 * doc.save here). Reuses the shared Alef font loader + BiDi reorderer from
 * exportTable.ts so the Hebrew handling matches every other PDF in the app.
 *
 * A branded full-page letterhead (public/intake-letterhead.png) is drawn as the
 * background of every page; the artwork sits top-left and the logo bottom-right,
 * so the text is laid out on the right/centre and kept clear of both. If the
 * image is missing the PDF still renders (just without the background).
 *
 * Runs in the browser at submit time, so the public page needs no server-side
 * font/filesystem work.
 */

import { jsPDF } from 'jspdf';
import { visualOrder, loadFonts } from './exportTable';

const ACCENT: [number, number, number] = [13, 148, 136];
const TEXT:   [number, number, number] = [26, 35, 50];
const MUTED:  [number, number, number] = [100, 116, 139];
const RULE:   [number, number, number] = [210, 205, 193];
const MARGIN = 48;
// Keep content clear of the top-left artwork and the bottom-right logo.
const CONTENT_TOP = 150;
const BOTTOM_SAFE = 96;

export const LETTERHEAD_URL = '/intake-letterhead.png';

export interface IntakePdfAnswer {
  question: string;
  /** Answer text (typed or dictated to text). */
  text: string;
}

export interface IntakePdfData {
  patientName: string;
  /** e.g. "מולא ע״י המטופלת" / "מולא ע״י המטפלת". */
  filledByLabel: string;
  submittedAt: Date;
  answers: IntakePdfAnswer[];
  /** PNG data-URL of the signature, or null. */
  signatureDataUrl: string | null;
}

type Doc = jsPDF & { getNumberOfPages: () => number };
interface Cursor { y: number }

function pad(n: number): string { return String(n).padStart(2, '0'); }
function pageW(doc: Doc): number { return doc.internal.pageSize.getWidth(); }
function pageH(doc: Doc): number { return doc.internal.pageSize.getHeight(); }

function human(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Load + cache the letterhead image as a PNG data-URL. Returns null if absent. */
let _bgPromise: Promise<string | null> | null = null;
function loadLetterhead(): Promise<string | null> {
  if (_bgPromise) return _bgPromise;
  _bgPromise = (async () => {
    try {
      const res = await fetch(LETTERHEAD_URL);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string | null>(resolve => {
        const fr = new FileReader();
        fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  return _bgPromise;
}

function drawBackground(doc: Doc, bg: string | null) {
  if (!bg) return;
  try {
    doc.addImage(bg, 'PNG', 0, 0, pageW(doc), pageH(doc));
  } catch {
    /* ignore a bad image — text still renders */
  }
}

function ensureSpace(doc: Doc, c: Cursor, needed: number, bg: string | null) {
  if (c.y + needed > pageH(doc) - BOTTOM_SAFE) {
    doc.addPage();
    drawBackground(doc, bg);
    c.y = CONTENT_TOP;
  }
}

/** Right-aligned wrapped paragraph (wrap in logical order, BiDi per line). */
function paragraph(doc: Doc, c: Cursor, text: string, size: number, color: [number, number, number], bg: string | null) {
  const maxW = pageW(doc) - 2 * MARGIN;
  doc.setFont('Alef', 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  for (const para of text.split(/\r?\n/)) {
    const wrapped = doc.splitTextToSize(para || ' ', maxW) as string[];
    for (const line of wrapped) {
      ensureSpace(doc, c, size + 5, bg);
      doc.text(visualOrder(line), pageW(doc) - MARGIN, c.y, { align: 'right' });
      c.y += size + 5;
    }
  }
}

export async function buildIntakePdfBlob(data: IntakePdfData): Promise<Blob> {
  const [{ regular, bold }, bg] = await Promise.all([loadFonts(), loadLetterhead()]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }) as Doc;
  doc.addFileToVFS('Alef-Regular.ttf', regular);
  doc.addFont('Alef-Regular.ttf', 'Alef', 'normal');
  doc.addFileToVFS('Alef-Bold.ttf', bold);
  doc.addFont('Alef-Bold.ttf', 'Alef', 'bold');
  doc.setFont('Alef', 'normal');

  drawBackground(doc, bg);

  // ── Title block (kept on the right; artwork is top-left) ──
  doc.setFont('Alef', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...ACCENT);
  doc.text(visualOrder('טופס הצטרפות'), pageW(doc) - MARGIN, 62, { align: 'right' });
  doc.setFontSize(13);
  doc.setTextColor(...TEXT);
  doc.text(visualOrder(data.patientName), pageW(doc) - MARGIN, 84, { align: 'right' });
  doc.setFont('Alef', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(visualOrder(`תאריך מילוי: ${human(data.submittedAt)}`), pageW(doc) - MARGIN, 102, { align: 'right' });
  doc.text(visualOrder(data.filledByLabel), pageW(doc) - MARGIN, 115, { align: 'right' });
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 128, pageW(doc) - MARGIN, 128);

  const c: Cursor = { y: CONTENT_TOP };

  // ── Answers ──
  for (const a of data.answers) {
    ensureSpace(doc, c, 30, bg);
    doc.setFont('Alef', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text(visualOrder(a.question), pageW(doc) - MARGIN, c.y, { align: 'right' });
    c.y += 16;

    const hasText = !!a.text && a.text.trim().length > 0;
    paragraph(doc, c, hasText ? a.text : '—', 10.5, hasText ? TEXT : MUTED, bg);
    c.y += 8;
  }

  // ── Signature (drawn on the left to stay clear of the bottom-right logo) ──
  ensureSpace(doc, c, 130, bg);
  c.y += 6;
  doc.setFont('Alef', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(visualOrder('חתימה'), pageW(doc) - MARGIN, c.y, { align: 'right' });
  c.y += 14;

  if (data.signatureDataUrl) {
    const sigW = 200;
    const sigH = 80;
    const x = MARGIN;
    try {
      doc.addImage(data.signatureDataUrl, 'PNG', x, c.y, sigW, sigH);
    } catch {
      /* ignore a malformed data-URL */
    }
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(x, c.y + sigH + 4, x + sigW, c.y + sigH + 4);
    c.y += sigH + 16;
  } else {
    paragraph(doc, c, '(ללא חתימה)', 10, MUTED, bg);
  }

  // ── Footers (bottom-left; logo occupies bottom-right) ──
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('Alef', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(visualOrder(`עמוד ${i} מתוך ${total}`), MARGIN, pageH(doc) - 24, { align: 'left' });
  }

  return doc.output('blob');
}
