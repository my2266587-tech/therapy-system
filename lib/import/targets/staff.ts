import type { TargetSpec } from '../types';

export const STAFF_TARGET: TargetSpec = {
  key:         'staff',
  label:       'אנשי צוות',
  description: 'ייבוא רשימת אנשי צוות — רכזות, מדריכות, מטפלות.',
  tableName:   'staff',
  // Same name + same email = same person
  dedupeKeys:  ['full_name', 'email'],
  fields: [
    { key: 'full_name', label: 'שם מלא', required: true, kind: 'string',
      aliases: ['name', 'שם'] },
    { key: 'role', label: 'תפקיד', required: true, kind: 'enum',
      enumValues: [
        { value: 'coordinator', labels: ['רכזת',   'coordinator'] },
        { value: 'instructor',  labels: ['מדריכה', 'instructor'] },
        { value: 'therapist',   labels: ['מטפלת',  'therapist'] },
        { value: 'other',       labels: ['אחר',    'other'] },
      ],
    },
    { key: 'email', label: 'אימייל', kind: 'string', aliases: ['email', 'מייל'] },
    { key: 'phone', label: 'טלפון', kind: 'string', aliases: ['phone', 'נייד'] },
    { key: 'notes', label: 'הערות', kind: 'string' },
  ],
};
