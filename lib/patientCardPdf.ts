/**
 * Patient-card PDF export ("הורדת כרטיס מטופלת").
 *
 * Builds a single, portrait-A4, fully RTL Hebrew PDF for ONE patient, including
 * only the sections the user selected in the export modal. Reuses the shared
 * Alef font loader + BiDi reorderer from exportTable.ts so the Hebrew handling
 * is identical to the table exporter.
 *
 * Layout rules:
 *   • RTL throughout — every text line is right-aligned and BiDi-reordered.
 *   • Dates are DD/MM/YYYY.
 *   • A selected section with no data prints "אין נתונים להצגה".
 *   • Short tabular sections use autoTable; long free-text (summaries, notes)
 *     is wrapped in logical order first, then BiDi-reordered per line, so the
 *     reordering never breaks across a wrap.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { visualOrder, loadFonts } from './exportTable';
import {
  patientStatusLabels, housingTypeLabels, maritalStatusLabels,
  sessionStatusLabels, paymentMethodLabels,
} from './labels';
import type { Patient, Session, SessionSummary } from '@/types';

/* ── Section identifiers ── */
export type PatientCardSection =
  | 'details' | 'sessions' | 'summaries' | 'documents' | 'payments' | 'notes';

export interface PatientCardDocument {
  file_name: string;
  mime_type: string | null;
  uploaded_at: string | null;
  file_size: number | null;
}

export interface PatientCardPayment {
  /** Resolved ISO date (linked summary date, or received_date) — may be null. */
  date: string | null;
  month: string | null;
  amount: number;
  is_paid: boolean;
  payment_method: string | null;
  notes: string | null;
}

export interface PatientCardData {
  patient: Patient;
  linkedStaff: { full_name: string; role: string }[];
  sessions: Session[];
  summaries: SessionSummary[];
  documents: PatientCardDocument[];
  payments: PatientCardPayment[];
}

/* ── Palette (matches the app accent) ── */
const ACCENT: [number, number, number] = [13, 148, 136];
const TEXT:   [number, number, number] = [26, 35, 50];
const MUTED:  [number, number, number] = [100, 116, 139];
const RULE:   [number, number, number] = [232, 236, 240];

const NO_DATA = 'אין נתונים להצגה';
const MARGIN = 40;

/* ── Small formatters ── */
function pad(n: number): string { return String(n).padStart(2, '0'); }

function ddmmyyyy(s: string | null | undefined): string {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function monthDisplay(month: string | null): string {
  if (!month) return '';
  const m = /^(\d{4})-(\d{2})/.exec(month);
  return m ? `${m[2]}/${m[1]}` : month;
}

function nowHuman(): string {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fileSize(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(name: string, mime: string | null): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
  if (ext === 'doc' || ext === 'docx' || (mime && mime.includes('word'))) return 'Word';
  if ((mime && mime.startsWith('image/')) || ['jpg','jpeg','png','gif','webp','heic','heif'].includes(ext)) return 'תמונה';
  return ext ? ext.toUpperCase() : 'קובץ';
}

/* ── jsPDF helpers ── */
type Doc = jsPDF & { lastAutoTable?: { finalY: number }; getNumberOfPages: () => number };
interface Cursor { y: number }

function pageW(doc: Doc): number { return doc.internal.pageSize.getWidth(); }
function pageH(doc: Doc): number { return doc.internal.pageSize.getHeight(); }

function ensureSpace(doc: Doc, c: Cursor, needed: number) {
  if (c.y + needed > pageH(doc) - 40) {
    doc.addPage();
    c.y = 48;
  }
}

function sectionHeading(doc: Doc, c: Cursor, title: string) {
  ensureSpace(doc, c, 46);
  c.y += 10;
  doc.setFont('Alef', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...ACCENT);
  doc.text(visualOrder(title), pageW(doc) - MARGIN, c.y, { align: 'right' });
  c.y += 7;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1);
  doc.line(MARGIN, c.y, pageW(doc) - MARGIN, c.y);
  c.y += 14;
  doc.setTextColor(...TEXT);
}

function noData(doc: Doc, c: Cursor) {
  ensureSpace(doc, c, 22);
  doc.setFont('Alef', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(visualOrder(NO_DATA), pageW(doc) - MARGIN, c.y, { align: 'right' });
  c.y += 20;
  doc.setTextColor(...TEXT);
}

/** Right-aligned wrapped paragraph. Wraps in LOGICAL order, BiDi per line. */
function paragraph(doc: Doc, c: Cursor, text: string, size = 10) {
  const maxW = pageW(doc) - 2 * MARGIN;
  doc.setFont('Alef', 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...TEXT);
  for (const para of text.split(/\r?\n/)) {
    const wrapped = doc.splitTextToSize(para || ' ', maxW) as string[];
    for (const line of wrapped) {
      ensureSpace(doc, c, size + 5);
      doc.text(visualOrder(line), pageW(doc) - MARGIN, c.y, { align: 'right' });
      c.y += size + 5;
    }
  }
  c.y += 4;
}

/**
 * A bordered table. `head`/`rows` are given in LOGICAL order (most-important
 * column first); we reverse so the first column lands on the RIGHT, as native
 * Hebrew tables read. Pass head=null for a header-less key/value grid.
 */
function table(
  doc: Doc, c: Cursor,
  head: string[] | null,
  rows: string[][],
  columnStyles?: Record<number, object>,
) {
  const visualHead = head ? [[...head].reverse().map(visualOrder)] : undefined;
  const body = rows.map(r => [...r].reverse().map(cell => visualOrder(cell ?? '')));
  autoTable(doc, {
    head: visualHead,
    body,
    startY: c.y,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      font: 'Alef', fontStyle: 'normal', fontSize: 9, cellPadding: 5,
      halign: 'right', valign: 'middle', lineColor: RULE, lineWidth: 0.5,
      textColor: TEXT, overflow: 'linebreak',
    },
    headStyles: {
      font: 'Alef', fontStyle: 'bold', fillColor: ACCENT,
      textColor: [255, 255, 255], halign: 'right',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
  });
  c.y = (doc.lastAutoTable?.finalY ?? c.y) + 16;
}

/* ── Sections ── */

function detailsSection(doc: Doc, c: Cursor, d: PatientCardData) {
  const p = d.patient;
  const linked = d.linkedStaff.map(s => s.full_name).filter(Boolean).join(', ');
  const coordinator = p.coordinator?.full_name ?? p.coordinator_name ?? '';
  const guide = p.staff_member?.full_name ?? p.guide_name ?? '';

  const pairs: [string, string | null | undefined][] = [
    ['שם מלא',          p.full_name],
    ['סטטוס',           patientStatusLabels[p.status] ?? p.status],
    ['טלפון',           p.phone],
    ['אימייל',          p.email],
    ['רכזת אחראית',     coordinator],
    ['איש צוות אחראי',  guide],
    ['צוות',            p.team_name],
    ['אנשי צוות מקושרים', linked],
    ['סוג דירה',        p.housing_type ? housingTypeLabels[p.housing_type] : ''],
    ['כתובת דירה',      p.apartment_address],
    ['כתובת מגורים',    p.home_address],
    ['שם אבא',          p.father_name],
    ['שם אמא',          p.mother_name],
    ['מצב משפחתי',      p.marital_status ? (maritalStatusLabels[p.marital_status] ?? p.marital_status) : ''],
    ['מיקום במשפחה',    p.family_position],
  ];

  // Anything the importer stashed that the schema doesn't model.
  for (const [k, v] of Object.entries(p.import_metadata ?? {})) {
    if (typeof v === 'string' && v.trim()) pairs.push([k, v]);
  }

  const rows = pairs
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([label, v]) => [label, String(v)]);

  if (rows.length === 0) { noData(doc, c); return; }

  table(doc, c, null, rows, {
    1: { fontStyle: 'bold', cellWidth: 150, fillColor: [248, 250, 252], textColor: MUTED },
  });
}

function sessionsSection(doc: Doc, c: Cursor, d: PatientCardData) {
  if (d.sessions.length === 0) { noData(doc, c); return; }
  const head = ['תאריך', 'שעות', 'משך', 'סטטוס', 'הערות'];
  const rows = d.sessions.map(s => [
    ddmmyyyy(s.date),
    s.start_time ? `${s.start_time}${s.end_time ? ` - ${s.end_time}` : ''}` : '',
    s.duration_minutes ? `${s.duration_minutes} דק'` : '',
    sessionStatusLabels[s.status] ?? s.status,
    s.notes ?? '',
  ]);
  table(doc, c, head, rows, { 0: { cellWidth: 70 }, 1: { cellWidth: 80 } });
}

const SUMMARY_FIELDS: [keyof SessionSummary, string][] = [
  ['current_state',     'מצב נוכחי'],
  ['main_topics',       'נושאים חשובים שעלו'],
  ['treatment_actions', 'מה עשינו בטיפול'],
  ['next_steps',        'עם מה מתחילים בפגישה הבאה'],
  ['tasks_given',       'משימות שקיבלה'],
  ['progress',          'התקדמות'],
  ['difficulties',      'קושי בהתקדמות'],
  ['notes',             'הערות'],
];

function summariesSection(doc: Doc, c: Cursor, d: PatientCardData) {
  if (d.summaries.length === 0) { noData(doc, c); return; }
  d.summaries.forEach((s, idx) => {
    ensureSpace(doc, c, 34);
    const time = s.start_time ? `${s.start_time}${s.end_time ? ` - ${s.end_time}` : ''}` : '';
    const heading = [`פגישה מיום ${ddmmyyyy(s.date)}`, time].filter(Boolean).join('  ·  ');
    doc.setFont('Alef', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(visualOrder(heading), pageW(doc) - MARGIN, c.y, { align: 'right' });
    c.y += 16;

    let any = false;
    for (const [key, label] of SUMMARY_FIELDS) {
      const v = s[key] as string | null;
      if (!v || !v.trim()) continue;
      any = true;
      ensureSpace(doc, c, 18);
      doc.setFont('Alef', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...MUTED);
      doc.text(visualOrder(`${label}:`), pageW(doc) - MARGIN, c.y, { align: 'right' });
      c.y += 14;
      paragraph(doc, c, v, 10);
    }
    if (!any) {
      doc.setFont('Alef', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...MUTED);
      ensureSpace(doc, c, 16);
      doc.text(visualOrder('(ללא תוכן)'), pageW(doc) - MARGIN, c.y, { align: 'right' });
      c.y += 14;
    }

    // Divider between summaries.
    if (idx < d.summaries.length - 1) {
      c.y += 4;
      ensureSpace(doc, c, 10);
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, c.y, pageW(doc) - MARGIN, c.y);
      c.y += 12;
    } else {
      c.y += 6;
    }
    doc.setTextColor(...TEXT);
  });
}

function documentsSection(doc: Doc, c: Cursor, d: PatientCardData) {
  if (d.documents.length === 0) { noData(doc, c); return; }
  const head = ['שם הקובץ', 'סוג', 'תאריך עלייה', 'גודל'];
  const rows = d.documents.map(f => [
    f.file_name,
    fileKind(f.file_name, f.mime_type),
    ddmmyyyy(f.uploaded_at),
    fileSize(f.file_size),
  ]);
  table(doc, c, head, rows, { 1: { cellWidth: 60 }, 2: { cellWidth: 80 }, 3: { cellWidth: 60 } });
}

function paymentsSection(doc: Doc, c: Cursor, d: PatientCardData) {
  if (d.payments.length === 0) { noData(doc, c); return; }
  const head = ['תאריך', 'סכום (₪)', 'סטטוס', 'אמצעי תשלום', 'הערות'];
  const rows = d.payments.map(p => [
    p.date ? ddmmyyyy(p.date) : monthDisplay(p.month),
    Number(p.amount).toLocaleString('he-IL'),
    p.is_paid ? 'שולם' : 'לא שולם',
    p.payment_method ? (paymentMethodLabels[p.payment_method] ?? p.payment_method) : '',
    p.notes ?? '',
  ]);
  table(doc, c, head, rows, { 0: { cellWidth: 70 }, 1: { cellWidth: 70 }, 2: { cellWidth: 70 } });
}

function notesSection(doc: Doc, c: Cursor, d: PatientCardData) {
  const notes = d.patient.notes;
  if (!notes || !notes.trim()) { noData(doc, c); return; }
  paragraph(doc, c, notes, 10);
}

/* ── Title + footers ── */
function titleBlock(doc: Doc, patient: Patient): number {
  doc.setFont('Alef', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...ACCENT);
  doc.text(visualOrder('כרטיס מטופלת'), pageW(doc) - MARGIN, 48, { align: 'right' });
  doc.setFontSize(14);
  doc.setTextColor(...TEXT);
  doc.text(visualOrder(patient.full_name), pageW(doc) - MARGIN, 70, { align: 'right' });
  doc.setFont('Alef', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(visualOrder(`תאריך הפקה: ${nowHuman()}`), MARGIN, 70, { align: 'left' });
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 80, pageW(doc) - MARGIN, 80);
  doc.setTextColor(...TEXT);
  return 96;
}

function addFooters(doc: Doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('Alef', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(visualOrder(`עמוד ${i} מתוך ${total}`), pageW(doc) / 2, pageH(doc) - 16, { align: 'center' });
  }
}

/* ── Section dispatch (kept in the order the brief lists them) ── */
const SECTION_ORDER: { key: PatientCardSection; title: string; render: (d: Doc, c: Cursor, data: PatientCardData) => void }[] = [
  { key: 'details',   title: 'פרטי מטופלת',   render: detailsSection },
  { key: 'sessions',  title: 'פגישות',         render: sessionsSection },
  { key: 'summaries', title: 'סיכומי פגישות',  render: summariesSection },
  { key: 'documents', title: 'מסמכים / קבצים', render: documentsSection },
  { key: 'payments',  title: 'תשלומים',        render: paymentsSection },
  { key: 'notes',     title: 'הערות כלליות',   render: notesSection },
];

export async function exportPatientCardPdf(
  data: PatientCardData,
  sections: PatientCardSection[],
): Promise<void> {
  const { regular, bold } = await loadFonts();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }) as Doc;
  doc.addFileToVFS('Alef-Regular.ttf', regular);
  doc.addFont('Alef-Regular.ttf', 'Alef', 'normal');
  doc.addFileToVFS('Alef-Bold.ttf', bold);
  doc.addFont('Alef-Bold.ttf', 'Alef', 'bold');
  doc.setFont('Alef', 'normal');

  const cursor: Cursor = { y: titleBlock(doc, data.patient) };
  const want = new Set(sections);

  for (const s of SECTION_ORDER) {
    if (!want.has(s.key)) continue;
    sectionHeading(doc, cursor, s.title);
    s.render(doc, cursor, data);
  }

  addFooters(doc);
  doc.save(`patient-card-${data.patient.id.slice(0, 8)}-${todayStamp()}.pdf`);
}
