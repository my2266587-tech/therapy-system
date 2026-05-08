import type { TargetSpec } from '../types';

export const EXPENSES_TARGET: TargetSpec = {
  key:         'expenses',
  label:       'הוצאות פרטיות',
  description: 'ייבוא הוצאות טיפול עבור מטופלות (חומרים, פעולות, עלויות).',
  tableName:   'private_expenses',
  // Same patient + same date + same treatment_type = same expense
  dedupeKeys:  ['patient_id', 'date', 'treatment_type'],
  fields: [
    { key: 'patient_id', label: 'שם מטופלת', required: true, kind: 'lookup',
      aliases: ['patient', 'מטופלת'],
      lookup: { table: 'patients', matchOn: 'full_name' } },
    { key: 'date',           label: 'תאריך',     required: true, kind: 'date',
      aliases: ['date'] },
    { key: 'treatment_type', label: 'סוג טיפול', required: true, kind: 'string',
      aliases: ['treatment', 'type'] },
    { key: 'cost',           label: 'עלות',      required: true, kind: 'number',
      aliases: ['cost', 'amount', 'מחיר'] },
    { key: 'materials',      label: 'חומרים',    kind: 'string', aliases: ['materials'] },
    { key: 'details',        label: 'פרטים',     kind: 'string', aliases: ['details', 'תיאור'] },
    { key: 'notes',          label: 'הערות',     kind: 'string' },
  ],
};
