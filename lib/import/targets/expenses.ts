import type { TargetSpec } from '../types';

export const EXPENSES_TARGET: TargetSpec = {
  key:         'expenses',
  label:       'הוצאות פרטיות',
  description: 'ייבוא הוצאות טיפול עבור מטופלות (חומרים, פעולות, עלויות).',
  tableName:   'private_expenses',
  dedupeKeys:  ['patient_id', 'date', 'treatment_type'],
  fields: [
    { key: 'patient_id', label: 'שם מטופלת', required: true, kind: 'lookup',
      aliases: [
        'patient', 'מטופלת', 'מטופל', 'name', 'שם', 'שם המטופלת',
      ],
      lookup: { table: 'patients', matchOn: 'full_name' } },
    { key: 'date', label: 'תאריך', required: true, kind: 'date',
      aliases: ['date', 'תאריך הוצאה', 'יום'] },
    { key: 'treatment_type', label: 'סוג טיפול', required: true, kind: 'string',
      aliases: ['treatment', 'type', 'סוג', 'תחום טיפול'] },
    { key: 'cost', label: 'עלות', required: true, kind: 'number',
      aliases: ['cost', 'amount', 'מחיר', 'סכום', 'עלות בש״ח'] },
    { key: 'materials', label: 'חומרים', kind: 'string',
      aliases: ['materials', 'ציוד', 'חומר'] },
    { key: 'details', label: 'פרטים', kind: 'string',
      aliases: ['details', 'תיאור', 'פירוט'] },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'comment', 'comments'] },
  ],
};
