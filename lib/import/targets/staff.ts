import type { TargetSpec } from '../types';
import { STAFF_ROLE_ENUM_VALUES } from '@/lib/staffRoles';

export const STAFF_TARGET: TargetSpec = {
  key:         'staff',
  label:       'אנשי צוות',
  description: 'ייבוא רשימת אנשי צוות — רכזות, מדריכות, מטפלות, מנהלים, קב"ס, עו"ס.',
  tableName:   'staff',
  dedupeKeys:  ['full_name', 'email'],
  captureUnmappedAsMetadata: true,
  fields: [
    { key: 'full_name', label: 'שם מלא', required: true, kind: 'string', maxLength: 120,
      aliases: [
        'שם', 'שם פרטי ומשפחה', 'שם פרטי + משפחה',
        'name', 'full name', 'fullname',
      ] },
    { key: 'role', label: 'תפקיד', required: true, kind: 'enum',
      aliases: ['role', 'משרה', 'תפקיד במערכת'],
      // Single source of truth — see lib/staffRoles.ts. Adding a new
      // role or alias there flows to the form, the badges, and this
      // import target in one go.
      enumValues: STAFF_ROLE_ENUM_VALUES,
    },
    { key: 'email', label: 'אימייל', kind: 'string', maxLength: 150,
      aliases: ['מייל', 'דואר אלקטרוני', 'דוא״ל', 'דואל', 'דוא"ל', 'email', 'e-mail', 'mail'] },
    { key: 'phone', label: 'טלפון', kind: 'string', maxLength: 40,
      aliases: [
        'נייד', 'פלאפון', 'סלולר', 'סלולרי', 'מספר טלפון', 'מספר נייד',
        'טל', 'phone', 'mobile', 'cell', 'cellphone', 'tel',
      ] },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'comment', 'comments'] },
  ],
};
