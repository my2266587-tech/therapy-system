/**
 * Single source of truth for UI-editable configuration.
 *
 * These DEFAULTS ship in code. An admin can override them from the UI
 * (Settings → "רשימות ותוויות"); overrides are stored in the `app_settings`
 * table and deep-merged on top of these defaults at read time. If the table is
 * empty or unreachable, the app behaves exactly as it does with these values.
 *
 * IMPORTANT — option `value`s are locked, only `label`s are editable.
 * The enum columns (status / housing_type / payment_method / role / ...) have
 * CHECK constraints in the database (supabase/schema.sql). Renaming a label is
 * always safe; adding/removing a *value* would require a schema migration, so
 * the editor exposes label editing only for these categories.
 *
 * Free-text lists (e.g. treatmentTypes) have no CHECK constraint and may be
 * added to / removed freely.
 */

export interface OptionItem {
  value: string;
  label: string;
}

export interface AppSettings {
  /** Enum-backed option lists — labels editable, values locked. */
  options: {
    patientStatus: OptionItem[];
    housingType: OptionItem[];
    maritalStatus: OptionItem[];
    sessionStatus: OptionItem[];
    recordingStatus: OptionItem[];
    paymentMethod: OptionItem[];
    emailStatus: OptionItem[];
    travelMode: OptionItem[];
    staffRole: OptionItem[];
  };
  /** Free-text lists — fully editable (add / rename / remove). */
  lists: {
    treatmentTypes: string[];
  };
  /** Free-form UI texts. */
  texts: {
    paymentsTitle: string;
  };
}

export type OptionCategory = keyof AppSettings['options'];

export const DEFAULT_SETTINGS: AppSettings = {
  options: {
    patientStatus: [
      { value: 'active', label: 'פעילה' },
      { value: 'inactive', label: 'לא פעילה' },
      { value: 'waiting', label: 'בהמתנה' },
    ],
    housingType: [
      { value: 'independent', label: 'עצמאיות' },
      { value: 'regular', label: 'רגיל' },
      { value: 'rehabilitation', label: 'משקם' },
    ],
    maritalStatus: [
      { value: 'single', label: 'רווקה' },
      { value: 'married', label: 'נשואה' },
      { value: 'divorced', label: 'גרושה' },
      { value: 'widowed', label: 'אלמנה' },
    ],
    sessionStatus: [
      { value: 'planned', label: 'מתוכננת' },
      { value: 'completed', label: 'התקיימה' },
      { value: 'cancelled', label: 'בוטלה' },
      { value: 'no_show', label: 'לא הגיעה' },
    ],
    recordingStatus: [
      { value: 'pending', label: 'ממתין לתמלול' },
      { value: 'transcribed', label: 'תומלל' },
      { value: 'draft_ready', label: 'טיוטה מוכנה' },
      { value: 'approved', label: 'אושר' },
    ],
    paymentMethod: [
      { value: 'bank_transfer', label: 'העברה בנקאית' },
      { value: 'cash', label: 'מזומן' },
      { value: 'check', label: "צ'ק" },
      { value: 'other', label: 'אחר' },
    ],
    emailStatus: [
      { value: 'not_sent', label: 'לא נשלח' },
      { value: 'sent', label: 'נשלח' },
      { value: 'failed', label: 'שגיאה' },
    ],
    travelMode: [
      { value: 'taxi', label: 'מונית' },
      { value: 'bus', label: 'אוטובוס' },
      { value: 'other', label: 'אחר' },
    ],
    staffRole: [
      { value: 'coordinator', label: 'רכזת' },
      { value: 'instructor', label: 'מדריכה' },
      { value: 'therapist', label: 'מטפלת' },
      { value: 'manager', label: 'מנהל' },
      { value: 'kabas', label: 'קב"ס' },
      { value: 'social_worker', label: 'עו"ס' },
      { value: 'other', label: 'אחר' },
    ],
  },
  lists: {
    treatmentTypes: ['אומנות', 'תרפיה', 'פיסול', 'מוזיקה', 'תנועה', 'אחר'],
  },
  texts: {
    paymentsTitle: 'תשלומי שיראל',
  },
};

/** Hebrew display name for each option category, used by the editor UI. */
export const OPTION_CATEGORY_LABELS: Record<OptionCategory, string> = {
  patientStatus: 'סטטוס מטופלת',
  housingType: 'סוג דירה',
  maritalStatus: 'מצב משפחתי',
  sessionStatus: 'סטטוס פגישה',
  recordingStatus: 'סטטוס הקלטה',
  paymentMethod: 'אמצעי תשלום',
  emailStatus: 'סטטוס מייל',
  travelMode: 'אמצעי נסיעה',
  staffRole: 'תפקיד צוות',
};

/**
 * Deep-merge admin overrides on top of DEFAULT_SETTINGS, preserving the locked
 * option `value`s and ignoring any unknown keys / values that the DB may hold.
 * Only labels (for options), list contents, and texts are taken from overrides.
 */
export function mergeSettings(overrides: unknown): AppSettings {
  const o = (overrides ?? {}) as Partial<AppSettings>;
  const merged: AppSettings = {
    options: { ...DEFAULT_SETTINGS.options },
    lists: { ...DEFAULT_SETTINGS.lists },
    texts: { ...DEFAULT_SETTINGS.texts },
  };

  // options — keep the default value order/keys, override label only when the
  // override provides a matching value with a non-empty string label.
  (Object.keys(DEFAULT_SETTINGS.options) as OptionCategory[]).forEach(cat => {
    const overrideList = o.options?.[cat];
    merged.options[cat] = DEFAULT_SETTINGS.options[cat].map(def => {
      const match = Array.isArray(overrideList)
        ? overrideList.find(x => x && x.value === def.value)
        : undefined;
      const label =
        match && typeof match.label === 'string' && match.label.trim()
          ? match.label
          : def.label;
      return { value: def.value, label };
    });
  });

  // lists — replace wholesale when a valid non-empty string[] is provided.
  if (Array.isArray(o.lists?.treatmentTypes)) {
    const cleaned = o.lists!.treatmentTypes
      .filter(x => typeof x === 'string' && x.trim())
      .map(x => x.trim());
    merged.lists.treatmentTypes = cleaned.length
      ? cleaned
      : DEFAULT_SETTINGS.lists.treatmentTypes;
  }

  // texts — override per-key when a non-empty string is provided.
  (Object.keys(DEFAULT_SETTINGS.texts) as (keyof AppSettings['texts'])[]).forEach(k => {
    const v = o.texts?.[k];
    if (typeof v === 'string' && v.trim()) merged.texts[k] = v;
  });

  return merged;
}

/** Convert an option list to a { value: label } map (for label-display lookups). */
export function toLabelMap(options: OptionItem[]): Record<string, string> {
  return options.reduce<Record<string, string>>((m, o) => {
    m[o.value] = o.label;
    return m;
  }, {});
}
