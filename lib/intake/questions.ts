/**
 * Intake ("join") form definition — "טופס הצטרפות".
 *
 * A FIXED set of questions, intentionally hard-coded (not a generic
 * questionnaire builder). Each question is a free-text field; the form UI
 * additionally offers an optional voice recording next to every question.
 *
 * If the program ever needs these editable without a deploy, they can move
 * into the existing app_settings lists mechanism — but per the brief we keep
 * the minimal solution here.
 */

export interface IntakeQuestion {
  id: string;
  label: string;
  /** Textarea height hint. 1 ≈ single-line answer; larger = free text. */
  rows: number;
}

/** Category label used both for the patient_documents row and the UI badge. */
export const INTAKE_CATEGORY = 'טופס הצטרפות';

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  { id: 'full_name',       label: 'שם מלא',                                    rows: 1 },
  { id: 'national_id',     label: 'תעודת זהות',                                rows: 1 },
  { id: 'birth_date',      label: 'תאריך לידה',                                rows: 1 },
  { id: 'address',         label: 'כתובת מגורים',                              rows: 1 },
  { id: 'phone',           label: 'טלפון ליצירת קשר',                          rows: 1 },
  { id: 'emergency',       label: 'איש קשר לשעת חירום (שם וטלפון)',            rows: 1 },
  { id: 'reason',          label: 'מה הביא אותך לפנות אלינו?',                 rows: 3 },
  { id: 'current_state',   label: 'תיאור קצר של המצב הנוכחי',                  rows: 3 },
  { id: 'background',      label: 'רקע רלוונטי / טיפולים קודמים',              rows: 3 },
  { id: 'medications',     label: 'תרופות קבועות (אם יש)',                     rows: 2 },
  { id: 'goals',           label: 'ציפיות ומטרות מהתהליך',                     rows: 3 },
  { id: 'notes',           label: 'הערות נוספות',                              rows: 3 },
];

export function questionById(id: string): IntakeQuestion | undefined {
  return INTAKE_QUESTIONS.find(q => q.id === id);
}
