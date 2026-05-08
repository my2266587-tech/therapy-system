import type { TargetSpec } from '../types';

/**
 * Coordinators are stored in the `staff` table with role='coordinator'.
 * This target hard-codes that role via defaultValues so the user picks
 * "רכזות" in the UI and the role is set automatically — they don't have
 * to remember to fill a "תפקיד" column. Dedup also runs only against
 * existing coordinator rows (see fetchExistingForDedup).
 *
 * Reference fields the coordinators CSV ships ("מטופלות", "תשלומים",
 * "סוג דירה") have no equivalent staff column — they get stashed in
 * import_metadata so nothing is lost.
 */

export const COORDINATORS_TARGET: TargetSpec = {
  key:         'coordinators',
  label:       'רכזות',
  description: 'ייבוא רכזות (נשמרות בטבלת הצוות עם תפקיד=רכזת).',
  tableName:   'staff',
  dedupeKeys:  ['full_name', 'email'],
  defaultValues: { role: 'coordinator' },
  captureUnmappedAsMetadata: true,
  fields: [
    { key: 'full_name', label: 'שם רכזת', required: true, kind: 'string',
      aliases: ['שם', 'name', 'full name', 'fullname', 'רכזת', 'שם הרכזת'] },
    { key: 'phone', label: 'טלפון רכזת', kind: 'string',
      aliases: [
        'טלפון', 'נייד', 'פלאפון', 'סלולר', 'סלולרי',
        'מספר טלפון', 'מספר נייד', 'טל',
        'phone', 'mobile', 'cell', 'tel',
      ] },
    { key: 'email', label: 'אימייל', kind: 'string',
      aliases: [
        'מייל', 'דואר אלקטרוני', 'דוא״ל', 'דואל', 'דוא"ל',
        'אימייל רכזת', 'מייל רכזת',
        'email', 'e-mail', 'mail',
      ] },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'הערות נוספות', 'comment', 'comments'] },
  ],
};
