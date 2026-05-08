import type { TargetSpec } from '../types';

export const SESSIONS_TARGET: TargetSpec = {
  key:         'sessions',
  label:       'פגישות',
  description: 'ייבוא לוח פגישות עם מטופלת, תאריך ושעות.',
  tableName:   'sessions',
  // patient + same date + same start_time = same session
  dedupeKeys:  ['patient_id', 'date', 'start_time'],
  fields: [
    { key: 'patient_id', label: 'שם מטופלת', required: true, kind: 'lookup',
      aliases: ['patient', 'מטופלת', 'name'],
      lookup: { table: 'patients', matchOn: 'full_name' },
      hint:   'יחפש לפי שם מלא בטבלת המטופלות.' },
    { key: 'date',       label: 'תאריך',   required: true, kind: 'date',
      aliases: ['date', 'תאריך הפגישה'],
      hint: 'YYYY-MM-DD או DD/MM/YYYY' },
    { key: 'start_time', label: 'שעת התחלה', required: true, kind: 'time',
      aliases: ['start', 'התחלה', 'שעה'] },
    { key: 'end_time',   label: 'שעת סיום',  required: true, kind: 'time',
      aliases: ['end', 'סיום'] },
    { key: 'duration_minutes', label: 'משך (דק׳)', kind: 'number',
      aliases: ['duration', 'משך'] },
    { key: 'status', label: 'סטטוס', kind: 'enum',
      enumValues: [
        { value: 'planned',   labels: ['מתוכננת',  'planned'] },
        { value: 'completed', labels: ['הושלמה',   'completed', 'בוצעה'] },
        { value: 'cancelled', labels: ['בוטלה',    'cancelled'] },
        { value: 'no_show',   labels: ['לא הגיעה', 'no_show'] },
      ],
    },
    { key: 'notes', label: 'הערות', kind: 'string', aliases: ['notes'] },
  ],
};
