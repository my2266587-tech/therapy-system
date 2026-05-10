import type { TargetSpec } from '../types';

/**
 * Header aliases below are matched case-insensitively after stripping all
 * non-Hebrew/non-Latin/non-digit characters. So "טלפון " trailing-space,
 * "שם המטופלת" with the definite article, "שם מטופלת" without, all
 * collapse properly. The "שם פרטי" + "שם משפחה" pair gets concatenated
 * in validate.ts before per-row work begins.
 *
 * Lookup fields ("רכזת אחראית", "מדריכה אחראית") use fallbackTextKey
 * so the row is still saved when the staff record doesn't exist yet —
 * the raw name lands on the denormalized text column.
 */

export const PATIENTS_TARGET: TargetSpec = {
  key:         'patients',
  label:       'מטופלות',
  description: 'ייבוא רשימת מטופלות חדשות עם פרטי קשר ופרטים אישיים.',
  tableName:   'patients',
  dedupeKeys:  ['full_name', 'phone'],
  captureUnmappedAsMetadata: true,
  fields: [
    { key: 'full_name', label: 'שם מלא', required: true, kind: 'string', maxLength: 120,
      aliases: [
        'שם', 'שם המטופלת', 'שם המטופל', 'שם פרטי ומשפחה',
        'שם פרטי + משפחה', 'שם הלקוחה', 'שם הלקוח', 'שם מטופלת',
        'name', 'full name', 'patient name', 'fullname',
      ] },
    { key: 'phone', label: 'טלפון', kind: 'string', maxLength: 40,
      aliases: [
        'נייד', 'פלאפון', 'סלולר', 'סלולרי', 'מספר טלפון', 'מספר נייד',
        'טל', 'טלפון נייד', 'מס טלפון', 'מס נייד',
        'phone', 'mobile', 'cell', 'cellphone', 'tel', 'telephone',
      ] },
    { key: 'email', label: 'אימייל', kind: 'string', maxLength: 150,
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
        { value: 'regular',        labels: ['רגילה', 'רגיל', 'regular'] },
        { value: 'rehabilitation', labels: ['שיקומית', 'שיקומי', 'rehabilitation', 'rehab'] },
      ],
    },
    { key: 'apartment_address', label: 'כתובת דירה', kind: 'string', maxLength: 200,
      aliases: ['apartment', 'דירה'] },
    { key: 'home_address', label: 'כתובת מגורים', kind: 'string', maxLength: 200,
      aliases: ['home', 'מגורים', 'כתובת בית', 'כתובת קבועה', 'כתובת'] },
    { key: 'father_name', label: 'שם אבא', kind: 'string', maxLength: 100,
      aliases: ['father', 'אבא', 'שם האבא', 'שם האב', 'אב'] },
    { key: 'mother_name', label: 'שם אמא', kind: 'string', maxLength: 100,
      aliases: ['mother', 'אמא', 'שם האמא', 'שם האם', 'אם'] },
    { key: 'family_position', label: 'מקום במשפחה', kind: 'string', maxLength: 80,
      aliases: ['position', 'מיקום במשפחה', 'מס׳ במשפחה'] },
    { key: 'marital_status', label: 'מצב משפחתי', kind: 'enum',
      enumValues: [
        { value: 'single',   labels: ['רווקה', 'רווק', 'single'] },
        { value: 'married',  labels: ['נשואה', 'נשוי', 'married'] },
        { value: 'divorced', labels: ['גרושה', 'גרוש', 'divorced'] },
        { value: 'widowed',  labels: ['אלמנה', 'אלמן', 'widowed'] },
      ],
      // Real CSVs sometimes carry a free-form paragraph in this column
      // (history of the patient's family situation). Route those to
      // notes rather than failing the row.
      overflowToKey: 'notes',
    },
    { key: 'team_name', label: 'צוות', kind: 'string', maxLength: 80,
      aliases: ['team', 'קבוצה', 'שם צוות'],
      hint: 'שם הצוות שאליו משויכת המטופלת.' },
    { key: 'coordinator_id', label: 'רכזת אחראית', kind: 'lookup',
      aliases: ['coordinator', 'שם רכזת', 'רכז', 'מרכזת', 'רכזת'],
      lookup: { table: 'staff', matchOn: 'full_name' },
      fallbackTextKey: 'coordinator_name',
      hint: 'יחפש בטבלת הצוות. אם לא נמצא — השם יישמר כטקסט בעמודת coordinator_name.' },
    { key: 'staff_id', label: 'מדריכה אחראית', kind: 'lookup',
      aliases: ['therapist', 'שם מטפלת', 'מטפל', 'מדריכה', 'מדריך', 'instructor'],
      lookup: { table: 'staff', matchOn: 'full_name' },
      fallbackTextKey: 'guide_name',
      hint: 'יחפש בטבלת הצוות. אם לא נמצאה — השם יישמר כטקסט בעמודת guide_name.' },
    { key: 'notes', label: 'הערות', kind: 'string',
      aliases: ['notes', 'הערה', 'הערות נוספות', 'comment', 'comments', 'remark'] },
  ],
};
