import type { TargetSpec } from '../types';

/**
 * Maps directly to session_summaries. Most CSV columns line up 1:1 with
 * existing fields; "סיכום פגישות - הקלטה" lands on the new
 * `recording_reference` text column (added by the schema migration).
 *
 * Dedup key is patient + date + start_time — same trio used by sessions,
 * so re-importing the same file twice doesn't create double summaries.
 */

export const SUMMARIES_TARGET: TargetSpec = {
  key:         'summaries',
  label:       'סיכומי פגישות',
  description: 'ייבוא סיכומי פגישות עבור מטופלות לפי תאריך פגישה.',
  tableName:   'session_summaries',
  dedupeKeys:  ['patient_id', 'date', 'start_time'],
  captureUnmappedAsMetadata: true,
  fields: [
    { key: 'patient_id', label: 'שם המטופלת', required: true, kind: 'lookup',
      aliases: [
        'patient', 'מטופלת', 'מטופל', 'name',
        'שם', 'שם המטופלת', 'שם מטופלת', 'שם הלקוחה',
      ],
      lookup: { table: 'patients', matchOn: 'full_name' },
      hint: 'יחפש בטבלת המטופלות. שורות בלי התאמה ייכשלו.' },
    { key: 'date', label: 'תאריך פגישה', required: true, kind: 'date',
      aliases: ['date', 'תאריך', 'תאריך הפגישה', 'יום', 'תאריך טיפול'] },
    { key: 'start_time', label: 'זמן הגעה משעה', kind: 'time',
      aliases: [
        'start', 'התחלה', 'שעה', 'משעה', 'מ',
        'זמן הגעה', 'משעה',
        'time', 'start time',
      ] },
    { key: 'end_time', label: 'עד השעה', kind: 'time',
      aliases: ['end', 'סיום', 'עד שעה', 'עד', 'end time'] },
    { key: 'duration_minutes', label: 'סה״כ זמן פגישה', kind: 'number',
      aliases: ['duration', 'משך', 'משך הפגישה', 'דקות', 'סהכ זמן', 'סה"כ זמן'] },
    { key: 'current_state', label: 'מצב נוכחי', kind: 'string',
      aliases: ['current state', 'מצב', 'סטטוס נוכחי'] },
    { key: 'main_topics', label: 'נושאים חשובים שעלו בטיפול', kind: 'string',
      aliases: ['main topics', 'נושאים', 'נושאים עיקריים', 'topics'] },
    { key: 'treatment_actions', label: 'מה עשינו בטיפול', kind: 'string',
      aliases: ['treatment actions', 'מה עשינו', 'פעולות טיפול', 'actions'] },
    { key: 'next_steps', label: 'עם מה מתחילים', kind: 'string',
      aliases: ['next steps', 'צעדים הבאים', 'התחלה הבאה', 'next starting point'] },
    { key: 'tasks_given', label: 'משימות שקיבלה', kind: 'string',
      aliases: ['tasks', 'משימות', 'assigned tasks', 'tasks given'] },
    { key: 'progress', label: 'התקדמות', kind: 'string',
      aliases: ['progress'] },
    { key: 'difficulties', label: 'קושי בהתקדמות', kind: 'string',
      aliases: [
        'difficulties', 'קושי', 'קשיים',
        'progress difficulty', 'קשיים בהתקדמות',
      ] },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'comment', 'comments'] },
    { key: 'attachment_url', label: 'מסמך מסיכום פגישה', kind: 'string',
      aliases: [
        'attachment', 'attachment url', 'summary document',
        'מסמך', 'קישור למסמך', 'קישור', 'document', 'url',
      ],
      hint: 'קישור URL למסמך הסיכום.' },
    { key: 'recording_reference', label: 'סיכום פגישות - הקלטה', kind: 'string',
      aliases: [
        'recording', 'recording reference',
        'הקלטה', 'קישור להקלטה', 'הפניה להקלטה',
      ],
      hint: 'הפניה חופשית להקלטה — URL או טקסט מזהה.' },
  ],
};
