/**
 * Intake-form PDF builder ("טופס הצטרפות").
 *
 * Builds a single, portrait-A4, fully RTL Hebrew PDF summarising one submitted
 * intake form and RETURNS it as a Blob (the caller uploads it; we never call
 * doc.save here). Reuses the shared Alef font loader + BiDi reorderer from
 * exportTable.ts so the Hebrew handling matches every other PDF in the app.
 *
 * Runs in the browser at submit time (both for the patient via the personal
 * link and for the therapist filling from inside the system), so the public
 * page needs no server-side font/filesystem work.
 */

import { jsPDF } from 'jspdf';
import { visualOrder, loadFonts } from './exportTable';

const ACCENT: [number, number, number] = [13, 148, 136];
const TEXT:   [number, number, number] = [26, 35, 50];
const MUTED:  [number, number, number] = [100, 116, 139];
const RULE:   [number, number, number] = [232, 236, 240];
const MARGIN = 40;

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

function ensureSpace(doc: Doc, c: Cursor, needed: number) {
  if (c.y + needed > pageH(doc) - 40) {
    doc.addPage();
    c.y = 48;
  }
}

/** Right-aligned wrapped paragraph (wrap in logical order, BiDi per line). */
function paragraph(doc: Doc, c: Cursor, text: string, size: number, color: [number, number, number]) {
  const maxW = pageW(doc) - 2 * MARGIN;
  doc.setFont('Alef', 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  for (const para of text.split(/\r?\n/)) {
    const wrapped = doc.splitTextToSize(para || ' ', maxW) as string[];
    for (const line of wrapped) {
      ensureSpace(doc, c, size + 5);
      doc.text(visualOrder(line), pageW(doc) - MARGIN, c.y, { align: 'right' });
      c.y += size + 5;
    }
  }
}

export async function buildIntakePdfBlob(data: IntakePdfData): Promise<Blob> {
  const { regular, bold } = await loadFonts();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }) as Doc;
  doc.addFileToVFS('Alef-Regular.ttf', regular);
  doc.addFont('Alef-Regular.ttf', 'Alef', 'normal');
  doc.addFileToVFS('Alef-Bold.ttf', bold);
  doc.addFont('Alef-Bold.ttf', 'Alef', 'bold');
  doc.setFont('Alef', 'normal');

  // ── Title block ──
  doc.setFont('Alef', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...ACCENT);
  doc.text(visualOrder('טופס הצטרפות'), pageW(doc) - MARGIN, 48, { align: 'right' });
  doc.setFontSize(14);
  doc.setTextColor(...TEXT);
  doc.text(visualOrder(data.patientName), pageW(doc) - MARGIN, 70, { align: 'right' });
  doc.setFont('Alef', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(visualOrder(`תאריך מילוי: ${human(data.submittedAt)}`), MARGIN, 60, { align: 'left' });
  doc.text(visualOrder(data.filledByLabel), MARGIN, 74, { align: 'left' });
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 84, pageW(doc) - MARGIN, 84);

  const c: Cursor = { y: 104 };

  // ── Answers ──
  for (const a of data.answers) {
    ensureSpace(doc, c, 30);
    doc.setFont('Alef', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text(visualOrder(a.question), pageW(doc) - MARGIN, c.y, { align: 'right' });
    c.y += 16;

    const hasText = !!a.text && a.text.trim().length > 0;
    paragraph(doc, c, hasText ? a.text : '—', 10.5, hasText ? TEXT : MUTED);
    c.y += 8;
  }

  // ── Signature ──
  ensureSpace(doc, c, 130);
  c.y += 6;
  doc.setFont('Alef', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(visualOrder('חתימה'), pageW(doc) - MARGIN, c.y, { align: 'right' });
  c.y += 14;

  if (data.signatureDataUrl) {
    const sigW = 200;
    const sigH = 90;
    const x = pageW(doc) - MARGIN - sigW;
    try {
      doc.addImage(data.signatureDataUrl, 'PNG', x, c.y, sigW, sigH);
    } catch {
      // Ignore a malformed data-URL — the rest of the PDF is still valid.
    }
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(x, c.y + sigH + 4, x + sigW, c.y + sigH + 4);
    c.y += sigH + 16;
  } else {
    paragraph(doc, c, '(ללא חתימה)', 10, MUTED);
  }

  // ── Footers ──
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('Alef', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(visualOrder(`עמוד ${i} מתוך ${total}`), pageW(doc) / 2, pageH(doc) - 16, { align: 'center' });
  }

  return doc.output('blob');
}
