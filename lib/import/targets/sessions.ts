import type { TargetSpec } from '../types';

export const SESSIONS_TARGET: TargetSpec = {
  key:         'sessions',
  label:       'פגישות',
  description: 'ייבוא לוח פגישות עם מטופלת, תאריך ושעות.',
  tableName:   'sessions',
  dedupeKeys:  ['patient_id', 'date', 'start_time'],
  fields: [
    { key: 'patient_id', label: 'שם מטופלת', required: true, kind: 'lookup',
      aliases: [
        'patient', 'מטופלת', 'מטופל', 'name', 'שם', 'שם המטופלת',
        'שם הלקוחה', 'שם פרטי ומשפחה',
      ],
      lookup: { table: 'patients', matchOn: 'full_name' },
      hint: 'יחפש לפי שם מלא בטבלת המטופלות.' },
    { key: 'date', label: 'תאריך', required: true, kind: 'date',
      aliases: [
        'date', 'תאריך הפגישה', 'תאריך פגישה', 'יום',
      ],
      hint: 'YYYY-MM-DD או DD/MM/YYYY' },
    { key: 'start_time', label: 'שעת התחלה', required: true, kind: 'time',
      aliases: ['start', 'התחלה', 'שעה', 'משעה', 'מ', 'time', 'start time'] },
    { key: 'end_time', label: 'שעת סיום', required: true, kind: 'time',
      aliases: ['end', 'סיום', 'עד שעה', 'עד', 'end time'] },
    { key: 'duration_minutes', label: 'משך (דק׳)', kind: 'number',
      aliases: ['duration', 'משך', 'משך הפגישה', 'דקות'] },
    { key: 'status', label: 'סטטוס', kind: 'enum',
      aliases: ['status', 'מצב'],
      enumValues: [
        { value: 'planned',   labels: ['מתוכננת', 'מתוכנן', 'planned'] },
        { value: 'completed', labels: ['הושלמה', 'הושלם', 'completed', 'בוצעה', 'בוצע'] },
        { value: 'cancelled', labels: ['בוטלה', 'בוטל', 'cancelled', 'בוטלה'] },
        { value: 'no_show',   labels: ['לא הגיעה', 'לא הגיע', 'no_show', 'no show', 'הברזה'] },
      ],
    },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'הערות נוספות', 'comment', 'comments'] },
  ],
};
