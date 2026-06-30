/**
 * How-to knowledge base for the internal assistant.
 *
 * This is the curated, hand-written set of step-by-step usage guides for the
 * system — "how do I add a patient", "how do I send the intake form", "where
 * do I find the monthly report", etc. The goal is to answer the day-to-day
 * "how do I do X" questions so the operator doesn't have to phone for help.
 *
 * READ-ONLY / NO DATABASE
 * ───────────────────────
 * Guides are static content. They touch NOTHING — no DB, no network. The
 * `getHowTo` tool that serves them is the safest tool in the registry: it
 * just looks up a string from this file. It fits the read-only contract
 * trivially (it doesn't even read data — only this constant).
 *
 * Keeping guides accurate:
 *   The `steps` reference real on-screen Hebrew labels (sidebar items, button
 *   captions, modal titles). When a button caption changes in the UI, update
 *   the matching guide here too. Each guide links to the page it describes.
 *
 * Adding a new guide:
 *   1. Add an entry to GUIDES with a unique `key`.
 *   2. Add the same `key` to the `topic` enum in toolSchemas.ts (getHowTo).
 *   No other wiring needed — tools.ts/dispatch.ts read GUIDES generically.
 */

export interface Guide {
  /** Stable machine key. Must match the getHowTo `topic` enum in toolSchemas.ts. */
  key: string;
  /** Short Hebrew title shown as the answer headline. */
  title: string;
  /**
   * Hebrew phrases / keywords used by the OFFLINE heuristic fallback to pick
   * a guide when the AI path is unavailable. The AI path selects by `key`.
   */
  aliases: string[];
  /** Ordered, numbered-by-the-UI steps. Each is one short Hebrew instruction. */
  steps: string[];
  /** Optional deep link to the relevant screen. */
  link?: { label: string; href: string };
  /** Optional one-line tip appended under the steps. */
  note?: string;
}

export const GUIDES: Guide[] = [
  /* ── Patients ──────────────────────────────────────────────────────── */
  {
    key: 'add_patient',
    title: 'הוספת מטופלת חדשה',
    aliases: ['להוסיף מטופלת', 'מטופלת חדשה', 'לפתוח מטופלת', 'להכניס מטופלת', 'רישום מטופלת'],
    steps: [
      'בתפריט הצד לחצי על "מטופלות".',
      'בראש העמוד לחצי על "+ הוסף מטופלת".',
      'מלאי בחלון שנפתח את הפרטים: שם מלא, סטטוס, פרטי קשר ושאר השדות.',
      'לחצי "שמירה" — המטופלת תופיע מיד ברשימה.',
    ],
    link: { label: 'מעבר למטופלות', href: '/patients' },
  },
  {
    key: 'edit_patient',
    title: 'עריכת פרטי מטופלת',
    aliases: ['לערוך מטופלת', 'לשנות פרטים', 'לעדכן מטופלת', 'לתקן פרטים של מטופלת'],
    steps: [
      'פתחי את כרטיס המטופלת (מתוך "מטופלות" לחצי על השם שלה).',
      'בראש הכרטיס לחצי על "ערוך פרטים".',
      'עדכני את השדות בחלון העריכה.',
      'לחצי "שמירה".',
    ],
    note: 'אפשר גם לבקש ממני "פתח כרטיס של [שם]" ואקפיץ אותך ישר לכרטיס.',
    link: { label: 'מעבר למטופלות', href: '/patients' },
  },
  {
    key: 'patient_card_pdf',
    title: 'הורדת כרטיס מטופלת ל‑PDF',
    aliases: ['להוריד כרטיס', 'כרטיס מטופלת pdf', 'להדפיס מטופלת', 'לייצא מטופלת', 'הורדת כרטיס'],
    steps: [
      'פתחי את כרטיס המטופלת.',
      'בראש הכרטיס לחצי על "הורדת כרטיס מטופלת".',
      'סמני אילו חלקים לכלול בקובץ (פרטים, פגישות, סיכומים וכו\').',
      'לחצי על כפתור ההורדה — ייווצר קובץ PDF שיורד למחשב.',
    ],
    link: { label: 'מעבר למטופלות', href: '/patients' },
  },
  {
    key: 'intake_form',
    title: 'שליחת / מילוי טופס הצטרפות (קליטה)',
    aliases: ['טופס הצטרפות', 'טופס קליטה', 'אינטייק', 'לשלוח טופס למטופלת', 'קישור לטופס', 'למלא טופס הצטרפות'],
    steps: [
      'פתחי את כרטיס המטופלת.',
      'בראש הכרטיס לחצי על "טופס הצטרפות".',
      'כדי שהמטופלת תמלא בעצמה — לחצי "העתקת קישור למטופלת" ושלחי לה את הקישור (וואטסאפ/מייל).',
      'כדי למלא יחד איתה עכשיו — לחצי "מילוי הטופס עכשיו" וימלא מתוך המערכת.',
      'לאחר שליחת הטופס נוצר אוטומטית PDF שנשמר ב"מסמכים" של המטופלת.',
    ],
    note: 'הנקודה הירוקה ליד "טופס הצטרפות" מסמנת שהטופס כבר מולא.',
    link: { label: 'מעבר למטופלות', href: '/patients' },
  },
  {
    key: 'patient_documents',
    title: 'העלאת מסמך למטופלת',
    aliases: ['להעלות מסמך', 'לצרף קובץ למטופלת', 'מסמכים של מטופלת', 'להוסיף מסמך'],
    steps: [
      'פתחי את כרטיס המטופלת.',
      'עברי ללשונית "מסמכים".',
      'לחצי על "העלאת מסמך" ובחרי את הקובץ מהמחשב.',
      'הקובץ יופיע ברשימת המסמכים. לחיצה עליו פותחת אותו, ויש גם אפשרות מחיקה.',
    ],
    link: { label: 'מעבר למטופלות', href: '/patients' },
  },

  /* ── Staff ─────────────────────────────────────────────────────────── */
  {
    key: 'add_staff',
    title: 'הוספת איש צוות',
    aliases: ['להוסיף איש צוות', 'איש צוות חדש', 'להוסיף מטפלת', 'להוסיף רכזת', 'צוות חדש'],
    steps: [
      'בתפריט הצד לחצי על "צוות".',
      'לחצי על "+ הוסף איש צוות".',
      'מלאי שם, תפקיד, אימייל וטלפון.',
      'לחצי "שמירה".',
    ],
    link: { label: 'מעבר לצוות', href: '/staff' },
  },
  {
    key: 'suspend_staff',
    title: 'השהיית איש צוות (ולא מחיקה)',
    aliases: ['להשהות איש צוות', 'השהיה', 'להקפיא מטפלת', 'להחזיר לפעילות', 'איש צוות שעזב'],
    steps: [
      'בתפריט הצד לחצי על "צוות".',
      'ליד איש הצוות לחצי על כפתור ההשהיה ("השהה"), או פתחי את הכרטיס שלו ולחצי "השהה".',
      'איש הצוות יסומן כמושהה ויירד מהרשימות הפעילות — בלי לאבד שום נתון.',
      'כדי להחזיר אותו: בכרטיס שלו לחצי "החזר לפעילות".',
    ],
    note: 'השהיה עדיפה על מחיקה — היא שומרת את כל ההיסטוריה והקישורים.',
    link: { label: 'מעבר לצוות', href: '/staff' },
  },
  {
    key: 'link_staff_patients',
    title: 'קישור מטופלות לאיש צוות',
    aliases: ['לקשר מטופלת לצוות', 'ניהול קישורים', 'לשייך מטופלת למטפלת', 'לחבר מטופלת לרכזת'],
    steps: [
      'פתחי את כרטיס איש הצוות (מתוך "צוות").',
      'לחצי על "ניהול קישורים".',
      'חפשי את המטופלות הרצויות וסמני אותן.',
      'שמרי — המטופלות יופיעו כמקושרות לאיש הצוות.',
    ],
    link: { label: 'מעבר לצוות', href: '/staff' },
  },

  /* ── Sessions / calendar ───────────────────────────────────────────── */
  {
    key: 'add_session',
    title: 'הוספת פגישה',
    aliases: ['להוסיף פגישה', 'לקבוע פגישה', 'פגישה חדשה', 'לרשום פגישה', 'לתאם פגישה'],
    steps: [
      'בתפריט הצד לחצי על "פגישות".',
      'לחצי על "+ הוסף פגישה".',
      'בחרי מטופלת, תאריך, שעת התחלה וסיום וסטטוס.',
      'לחצי "שמירה". הפגישה תופיע גם בלוח השנה.',
    ],
    link: { label: 'מעבר לפגישות', href: '/sessions' },
  },
  {
    key: 'calendar',
    title: 'צפייה בלוח השנה',
    aliases: ['לוח שנה', 'יומן', 'לראות את כל הפגישות', 'תצוגת שבוע'],
    steps: [
      'בתפריט הצד לחצי על "לוח שנה".',
      'הפגישות מוצגות לפי תאריך ושעה.',
      'לחיצה על פגישה פותחת את פרטיה.',
    ],
    note: 'לשאלה מהירה אפשר פשוט לשאול אותי "אילו פגישות יש היום?" או "מחר".',
    link: { label: 'מעבר ללוח שנה', href: '/calendar' },
  },

  /* ── Summaries ─────────────────────────────────────────────────────── */
  {
    key: 'add_summary',
    title: 'כתיבת סיכום פגישה',
    aliases: ['להוסיף סיכום', 'לכתוב סיכום', 'סיכום פגישה', 'לתעד פגישה'],
    steps: [
      'בתפריט הצד לחצי על "סיכומי פגישות".',
      'לחצי על "+ הוסף סיכום".',
      'בחרי את המטופלת והפגישה, ומלאי את תוכן הסיכום.',
      'לחצי "שמירה".',
    ],
    note: 'כדי לדעת על מי חסר סיכום אפשר לשאול אותי "למי חסר סיכום פגישה?".',
    link: { label: 'מעבר לסיכומים', href: '/summaries' },
  },
  {
    key: 'phone_pending',
    title: 'אישור סיכומים טלפוניים ממתינים',
    aliases: ['סיכום טלפוני', 'טלפוניים ממתינים', 'טיוטת סיכום', 'לאשר סיכום מהטלפון'],
    steps: [
      'בתפריט הצד לחצי על "טלפוניים ממתינים".',
      'פתחי טיוטה מהרשימה ובדקי שהיא מקושרת למטופלת הנכונה.',
      'השלימי או תקני את תוכן הסיכום לפי הצורך.',
      'לחצי "אישור" כדי להפוך את הטיוטה לסיכום פגישה רשמי.',
    ],
    link: { label: 'מעבר לטלפוניים ממתינים', href: '/summaries/phone-pending' },
  },
  {
    key: 'quarterly',
    title: 'הוספת סיכום רבעון',
    aliases: ['סיכום רבעון', 'סיכום רבעוני', 'דוח רבעון'],
    steps: [
      'בתפריט הצד לחצי על "סיכום רבעון".',
      'לחצי על "+ הוסף סיכום רבעון".',
      'בחרי מטופלת ותאריך ומלאי את תוכן הסיכום הרבעוני.',
      'לחצי "שמירה".',
    ],
    link: { label: 'מעבר לסיכום רבעון', href: '/quarterly' },
  },

  /* ── Money ─────────────────────────────────────────────────────────── */
  {
    key: 'add_payment',
    title: 'הוספת תשלום שיראל וסימון כ"שולם"',
    aliases: ['להוסיף תשלום', 'תשלום שיראל', 'לסמן שולם', 'לרשום תשלום', 'תשלום חדש'],
    steps: [
      'בתפריט הצד לחצי על "תשלומי שיראל".',
      'לחצי על "+ הוסף תשלום".',
      'מלאי סכום, תאריך ושאר הפרטים ושמרי.',
      'כדי לסמן שתשלום שולם — פתחי אותו לעריכה וסמני שהוא שולם.',
    ],
    note: 'כדי לראות מה עדיין פתוח אפשר לשאול אותי "אילו תשלומים עדיין פתוחים?".',
    link: { label: 'מעבר לתשלומי שיראל', href: '/payments' },
  },
  {
    key: 'expenses',
    title: 'רישום הוצאה פרטית',
    aliases: ['הוצאות פרטיות', 'להוסיף הוצאה', 'לרשום הוצאה', 'הוצאה פרטית'],
    steps: [
      'בתפריט הצד לחצי על "הוצאות פרטיות".',
      'לחצי על "+ הוסף הוצאה".',
      'מלאי את סוג הטיפול, העלות והחומרים, ושמרי.',
    ],
    link: { label: 'מעבר להוצאות פרטיות', href: '/expenses' },
  },
  {
    key: 'petty_cash',
    title: 'רישום הוצאה ב"מעשר געלט"',
    aliases: ['מעשר געלט', 'קופה קטנה', 'הוצאה במעשר'],
    steps: [
      'בתפריט הצד לחצי על "מעשר געלט".',
      'לחצי על "+ הוסף הוצאה".',
      'מלאי את מטרת ההוצאה והסכום, ושמרי.',
    ],
    link: { label: 'מעבר למעשר געלט', href: '/petty-cash' },
  },

  /* ── Reports / data ────────────────────────────────────────────────── */
  {
    key: 'monthly_report',
    title: 'הפקת דוח חודשי (Excel)',
    aliases: ['דוח חודשי', 'להפיק דוח', 'דוח אקסל', 'להוריד דוח', 'דוח פגישות חודשי'],
    steps: [
      'בתפריט הצד לחצי על "דוחות חודשיים".',
      'בחרי שנה וחודש בתיבות הבחירה (ברירת המחדל היא החודש הקודם).',
      'לחצי על "הפק דוח" — ייווצר קובץ Excel שיורד למחשב.',
      'דוחות שכבר הופקו מופיעים בהיסטוריה למטה, עם כפתור "↓ הורד".',
    ],
    link: { label: 'מעבר לדוחות חודשיים', href: '/reports/monthly' },
  },
  {
    key: 'import',
    title: 'ייבוא נתונים מאקסל / CSV',
    aliases: ['לייבא נתונים', 'ייבוא', 'להעלות אקסל', 'לייבא מטופלות', 'import'],
    steps: [
      'בתפריט הצד לחצי על "ייבוא נתונים".',
      'בחרי את היעד (מטופלות, תשלומים וכו\').',
      'העלי קובץ Excel/CSV.',
      'בדקי את התצוגה המקדימה — התאימי עמודות לשדות אם התבקש, ותקני שורות עם שגיאה.',
      'לחצי "אישור ייבוא" כדי לשמור את השורות התקינות.',
    ],
    note: 'הייבוא מציג תצוגה מקדימה לפני שמירה — שום דבר לא נשמר עד לחיצה על "אישור ייבוא".',
    link: { label: 'מעבר לייבוא נתונים', href: '/import' },
  },

  /* ── Settings ──────────────────────────────────────────────────────── */
  {
    key: 'settings_lists',
    title: 'עריכת רשימות, תוויות וטקסטים (ללא קוד)',
    aliases: ['לערוך רשימות', 'לשנות תוויות', 'סוגי טיפול', 'לשנות טקסט', 'הגדרות רשימות'],
    steps: [
      'בתפריט הצד לחצי על "הגדרות".',
      'היכנסי לעמוד "רשימות ותוויות".',
      'ערכי את סוגי הטיפול, התוויות והטקסטים לפי הצורך.',
      'השינוי נשמר ומתעדכן בכל המערכת — בלי צורך במתכנת.',
    ],
    link: { label: 'מעבר להגדרות הרשימות', href: '/settings/lists' },
  },
  {
    key: 'settings_users',
    title: 'ניהול משתמשים מורשים',
    aliases: ['להוסיף משתמש', 'משתמשים מורשים', 'הרשאות', 'לתת גישה', 'מנהל או צוות'],
    steps: [
      'בתפריט הצד לחצי על "הגדרות" ואז על עמוד המשתמשים.',
      'בטופס "הוספת משתמש חדש" הזיני אימייל ובחרי תפקיד (מנהל / צוות).',
      'לחצי הוספה — המשתמש יוכל להתחבר עם המייל הזה.',
      'ברשימת "משתמשים מורשים" אפשר לשנות תפקיד או להסיר גישה.',
    ],
    link: { label: 'מעבר לניהול משתמשים', href: '/settings/users' },
  },

  /* ── General ───────────────────────────────────────────────────────── */
  {
    key: 'dashboard',
    title: 'מסך הבית (דשבורד)',
    aliases: ['דשבורד', 'מסך הבית', 'עמוד ראשי', 'סקירה כללית'],
    steps: [
      'הדשבורד הוא העמוד הראשון שנפתח, וגם לחיצה על "דשבורד" בתפריט.',
      'הוא מציג תמונת מצב — פגישות קרובות, מספרים כלליים וקיצורי דרך.',
    ],
    link: { label: 'מעבר לדשבורד', href: '/' },
  },
  {
    key: 'search_navigate',
    title: 'איך מתמצאים במערכת',
    aliases: ['איפה מוצאים', 'איך מנווטים', 'תפריט', 'איפה זה נמצא', 'לא מוצאת'],
    steps: [
      'כל החלקים נמצאים בתפריט הצד הימני — מטופלות, צוות, פגישות, סיכומים, תשלומים, דוחות והגדרות.',
      'בתוך "מטופלות" ו"צוות" יש שורת חיפוש למעלה למציאה מהירה לפי שם.',
      'אפשר תמיד לשאול אותי בעברית פשוטה — למשל "איך מוסיפים פגישה?" ואדריך שלב‑שלב.',
    ],
  },
];

/** All guide keys — used to validate the getHowTo `topic` argument. */
export const GUIDE_KEYS = GUIDES.map(g => g.key);

/** O(1) lookup by key. */
const GUIDE_BY_KEY = new Map(GUIDES.map(g => [g.key, g]));

export function getGuide(key: string): Guide | undefined {
  return GUIDE_BY_KEY.get(key);
}

/**
 * Offline fallback matcher: score each guide by how many of its aliases (or
 * its title words) appear in the question. Returns the best match, or null
 * if nothing meaningful matched. Used only when the AI path is unavailable.
 */
export function matchGuide(question: string): Guide | null {
  const q = question.toLowerCase();
  let best: { guide: Guide; score: number } | null = null;
  for (const g of GUIDES) {
    let score = 0;
    for (const a of g.aliases) {
      if (q.includes(a.toLowerCase())) score += 2;
    }
    if (q.includes(g.title.toLowerCase())) score += 3;
    if (!best || score > best.score) best = { guide: g, score };
  }
  return best && best.score > 0 ? best.guide : null;
}
