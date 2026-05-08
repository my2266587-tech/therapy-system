import type { TargetSpec } from '../types';

/**
 * Real-world CSV often has a `received_date` ("13/3/2026") but no explicit
 * `month`. The postProcess hook derives "YYYY-MM" from the date so the
 * row passes the required-month check without manual fixing in Excel.
 */
function derivePaymentFields(ctx: import('../types').PostProcessContext) {
  const { values, fixes } = ctx;
  const month = values.month;
  const date  = values.received_date;
  if ((month == null || month === '') && typeof date === 'string') {
    const m = date.match(/^(\d{4})-(\d{2})/);
    if (m) {
      values.month = `${m[1]}-${m[2]}`;
      fixes.push(`חודש: חולץ אוטומטית מתאריך הקבלה (${values.month}).`);
    }
  }
}

export const PAYMENTS_TARGET: TargetSpec = {
  key:         'payments',
  label:       'תשלומי שיראל',
  description: 'ייבוא רשומות תשלום חודשיות לרכזות.',
  tableName:   'payments',
  dedupeKeys:  ['coordinator_id', 'month'],
  captureUnmappedAsMetadata: true,
  postProcess: derivePaymentFields,
  fields: [
    { key: 'month', label: 'חודש', required: true, kind: 'string', maxLength: 30,
      aliases: ['month', 'חודש תשלום', 'תקופה'],
      hint: 'פורמט "YYYY-MM" או "מאי 2026" או מספר חודש.' },
    { key: 'amount', label: 'סכום', required: true, kind: 'number',
      aliases: ['amount', 'סכום בש״ח', 'סכום בש"ח', 'סכום לתשלום', 'סה"כ', 'total'],
      hint: 'תומך בסימן ₪ ובפסיק לאלפים.' },
    { key: 'is_paid', label: 'האם שולם', kind: 'boolean',
      aliases: ['paid', 'שולם', 'שולם?', 'סטטוס תשלום', 'תשלום בוצע', 'checked'],
      hint: '"כן"/"לא"/"שולם" / "checked" / "✓" / "true"/"false" / 1/0' },
    { key: 'payment_method', label: 'אופן תשלום', kind: 'enum',
      aliases: ['payment method', 'אמצעי', 'שיטת תשלום', 'אמצעי תשלום'],
      enumValues: [
        { value: 'bank_transfer', labels: ['העברה בנקאית', 'bank_transfer', 'העברה', 'bank transfer'] },
        { value: 'cash',          labels: ['מזומן', 'cash'] },
        { value: 'check',         labels: ['צ׳ק', 'צק', 'שיק', 'check', 'cheque'] },
        { value: 'other',         labels: ['אחר', 'אחרת', 'other'] },
      ],
    },
    { key: 'received_date', label: 'תאריך קבלה', kind: 'date',
      aliases: ['received', 'תאריך התשלום', 'תאריך', 'תאריך קבלת התשלום'],
      hint: 'תומך ב-DD/MM/YYYY ובפורמט ISO.' },
    { key: 'coordinator_id', label: 'רכזת', kind: 'lookup',
      aliases: [
        'coordinator', 'שם רכזת', 'רכז', 'מרכזת',
        'שם', 'קישור לרכזות', 'רכזת אחראית',
      ],
      lookup: { table: 'staff', matchOn: 'full_name' },
      hint: 'אם הרכזת לא קיימת בטבלת הצוות — השדה יישאר ריק והשם ייכנס ל-import_metadata.' },
    { key: 'email_status', label: 'סטטוס מייל', kind: 'enum',
      aliases: ['email status', 'סטטוס דוא״ל'],
      enumValues: [
        { value: 'not_sent', labels: ['לא נשלח', 'not_sent', 'not sent'] },
        { value: 'sent',     labels: ['נשלח', 'sent'] },
        { value: 'failed',   labels: ['כשל', 'failed'] },
      ],
    },
  ],
};
