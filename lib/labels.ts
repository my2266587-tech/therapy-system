// תרגומי ערכי DB לעברית — לשימוש בכל המערכת
//
// ערכי ברירת המחדל מוגדרים במקום אחד: lib/settings/defaults.ts.
// המפות כאן נגזרות מאותו מקור, ומשמשות הקשרים שאינם React (יצוא PDF/CSV, שרת)
// כברירת מחדל בטוחה. רכיבי React חיים מושכים את הערכים הניתנים לעריכה דרך
// useSettings() (lib/settings/SettingsProvider).

import { DEFAULT_SETTINGS, toLabelMap } from '@/lib/settings/defaults';

export const patientStatusLabels   = toLabelMap(DEFAULT_SETTINGS.options.patientStatus);
export const housingTypeLabels     = toLabelMap(DEFAULT_SETTINGS.options.housingType);
export const maritalStatusLabels   = toLabelMap(DEFAULT_SETTINGS.options.maritalStatus);
export const staffRoleLabels       = toLabelMap(DEFAULT_SETTINGS.options.staffRole);
export const sessionStatusLabels   = toLabelMap(DEFAULT_SETTINGS.options.sessionStatus);
export const recordingStatusLabels = toLabelMap(DEFAULT_SETTINGS.options.recordingStatus);
export const paymentMethodLabels   = toLabelMap(DEFAULT_SETTINGS.options.paymentMethod);
export const emailStatusLabels     = toLabelMap(DEFAULT_SETTINGS.options.emailStatus);

export const treatmentTypeOptions  = DEFAULT_SETTINGS.lists.treatmentTypes;
