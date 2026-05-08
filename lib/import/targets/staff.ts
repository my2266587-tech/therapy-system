import type { TargetSpec } from '../types';

export const STAFF_TARGET: TargetSpec = {
  key:         'staff',
  label:       'אנשי צוות',
  description: 'ייבוא רשימת אנשי צוות — מדריכות, מטפלות (ולרכזות יש מסך נפרד).',
  tableName:   'staff',
  dedupeKeys:  ['full_name', 'email'],
  captureUnmappedAsMetadata: true,
  fields: [
    { key: 'full_name', label: 'שם מלא', required: true, kind: 'string',
      aliases: [
        'שם', 'שם פרטי ומשפחה', 'שם פרטי + משפחה',
        'name', 'full name', 'fullname',
      ] },
    { key: 'role', label: 'תפקיד', required: true, kind: 'enum',
      aliases: ['role', 'משרה', 'תפקיד במערכת'],
      enumValues: [
        { value: 'coordinator', labels: ['רכזת', 'רכז', 'coordinator', 'מרכזת'] },
        { value: 'instructor',  labels: ['מדריכה', 'מדריך', 'instructor'] },
        { value: 'therapist',   labels: ['מטפלת', 'מטפל', 'therapist'] },
        { value: 'other',       labels: ['אחר', 'אחרת', 'other'] },
      ],
    },
    { key: 'email', label: 'אימייל', kind: 'string',
      aliases: ['מייל', 'דואר אלקטרוני', 'דוא״ל', 'דואל', 'דוא"ל', 'email', 'e-mail', 'mail'] },
    { key: 'phone', label: 'טלפון', kind: 'string',
      aliases: [
        'נייד', 'פלאפון', 'סלולר', 'סלולרי', 'מספר טלפון', 'מספר נייד',
        'טל', 'phone', 'mobile', 'cell', 'cellphone', 'tel',
      ] },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'comment', 'comments'] },
  ],
};
