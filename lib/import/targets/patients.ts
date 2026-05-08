import type { TargetSpec } from '../types';

/**
 * Header aliases below are matched case-insensitively after stripping
 * gershayim, dots, dashes, and whitespace. So "טל'", "טל.", "טל"  all
 * collapse to "טל" → mapped to phone. The "שם פרטי" + "שם משפחה"
 * pair gets concatenated in validate.ts before per-row work begins.
 */

export const PATIENTS_TARGET: TargetSpec = {
  key:         'patients',
  label:       'מטופלות',
  description: 'ייבוא רשימת מטופלות חדשות עם פרטי קשר ופרטים אישיים.',
  tableName:   'patients',
  dedupeKeys:  ['full_name', 'phone'],
  fields: [
    { key: 'full_name', label: 'שם מלא', required: true, kind: 'string',
      aliases: [
        'שם', 'שם המטופלת', 'שם המטופל', 'שם פרטי ומשפחה',
        'שם פרטי + משפחה', 'שם הלקוחה', 'שם הלקוח',
        'name', 'full name', 'patient name', 'fullname',
      ] },
    { key: 'phone', label: 'טלפון', kind: 'string',
      aliases: [
        'נייד', 'פלאפון', 'סלולר', 'סלולרי', 'מספר טלפון', 'מספר נייד',
        'טל', 'טלפון נייד', 'מס טלפון', 'מס נייד',
        'phone', 'mobile', 'cell', 'cellphone', 'tel', 'telephone',
      ] },
    { key: 'email', label: 'אימייל', kind: 'string',
      aliases: [
        'מייל', 'דואר אלקטרוני', 'דוא״ל', 'דואל', 'דוא"ל',
        'email', 'e-mail', 'mail',
      ] },
    { key: 'status', label: 'סטטוס', kind: 'enum',
      aliases: ['status', 'מצב'],
      enumValues: [
        { value: 'active',   labels: ['פעילה', 'פעיל', 'active', 'פעילות'] },
        { value: 'inactive', labels: ['לא פעילה', 'לא פעיל', 'inactive', 'לא פעילות'] },
        { value: 'waiting',  labels: ['ממתינה', 'ממתין', 'בהמתנה', 'waiting', 'pending'] },
      ],
    },
    { key: 'housing_type', label: 'סוג דירה', kind: 'enum',
      aliases: ['housing', 'דיור', 'סוג מגורים', 'סוג דיור'],
      enumValues: [
        { value: 'independent',    labels: ['עצמאית', 'עצמאי', 'independent'] },
        { value: 'regular',        labels: ['רגילה', 'רגיל', 'regular', 'רגיל ה'] },
        { value: 'rehabilitation', labels: ['שיקומית', 'שיקומי', 'rehabilitation', 'rehab'] },
      ],
    },
    { key: 'apartment_address', label: 'כתובת דירה', kind: 'string',
      aliases: ['apartment', 'דירה', 'כתובת'] },
    { key: 'home_address', label: 'כתובת מגורים', kind: 'string',
      aliases: ['home', 'מגורים', 'כתובת בית', 'כתובת קבועה'] },
    { key: 'father_name', label: 'שם אבא', kind: 'string',
      aliases: ['father', 'אבא', 'שם האבא', 'שם האב', 'אב'] },
    { key: 'mother_name', label: 'שם אמא', kind: 'string',
      aliases: ['mother', 'אמא', 'שם האמא', 'שם האם', 'אם'] },
    { key: 'family_position', label: 'מקום במשפחה', kind: 'string',
      aliases: ['position', 'מיקום במשפחה', 'מס׳ במשפחה'] },
    { key: 'marital_status', label: 'מצב משפחתי', kind: 'enum',
      enumValues: [
        { value: 'single',   labels: ['רווקה', 'רווק', 'single'] },
        { value: 'married',  labels: ['נשואה', 'נשוי', 'married'] },
        { value: 'divorced', labels: ['גרושה', 'גרוש', 'divorced'] },
        { value: 'widowed',  labels: ['אלמנה', 'אלמן', 'widowed'] },
      ],
    },
    { key: 'coordinator_id', label: 'רכזת', kind: 'lookup',
      aliases: ['coordinator', 'שם רכזת', 'רכז', 'מרכזת'],
      lookup: { table: 'staff', matchOn: 'full_name' },
      hint:   'שם הרכזת — תיפתר אוטומטית לפי טבלת הצוות.' },
    { key: 'staff_id', label: 'מטפלת', kind: 'lookup',
      aliases: ['therapist', 'שם מטפלת', 'מטפל'],
      lookup: { table: 'staff', matchOn: 'full_name' },
      hint:   'שם המטפלת — תיפתר אוטומטית לפי טבלת הצוות.' },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'הערות נוספות', 'comment', 'comments', 'remark'] },
  ],
};
