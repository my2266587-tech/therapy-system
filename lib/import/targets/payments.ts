import type { TargetSpec } from '../types';

export const PAYMENTS_TARGET: TargetSpec = {
  key:         'payments',
  label:       'תשלומי שיראל',
  description: 'ייבוא רשומות תשלום חודשיות לרכזות.',
  tableName:   'payments',
  // Same coordinator + same month = same payment record
  dedupeKeys:  ['coordinator_id', 'month'],
  fields: [
    { key: 'month',  label: 'חודש',   required: true, kind: 'string',
      aliases: ['month'],
      hint: 'פורמט "YYYY-MM" או "מאי 2026".' },
    { key: 'amount', label: 'סכום', required: true, kind: 'number',
      aliases: ['amount', 'סכום בש״ח'] },
    { key: 'is_paid', label: 'שולם', kind: 'boolean',
      aliases: ['paid', 'שולם?'],
      hint: '"כן"/"לא" / "true"/"false" / 1/0' },
    { key: 'payment_method', label: 'אמצעי תשלום', kind: 'enum',
      enumValues: [
        { value: 'bank_transfer', labels: ['העברה בנקאית', 'bank_transfer', 'העברה'] },
        { value: 'cash',          labels: ['מזומן',         'cash'] },
        { value: 'check',         labels: ['צ׳ק',           'check'] },
        { value: 'other',         labels: ['אחר',           'other'] },
      ],
    },
    { key: 'received_date', label: 'תאריך קבלה', kind: 'date', aliases: ['received'] },
    { key: 'coordinator_id', label: 'רכזת', kind: 'lookup',
      aliases: ['coordinator', 'שם רכזת'],
      lookup: { table: 'staff', matchOn: 'full_name' } },
    { key: 'email_status', label: 'סטטוס מייל', kind: 'enum',
      enumValues: [
        { value: 'not_sent', labels: ['לא נשלח', 'not_sent'] },
        { value: 'sent',     labels: ['נשלח',    'sent'] },
        { value: 'failed',   labels: ['כשל',     'failed'] },
      ],
    },
  ],
};
