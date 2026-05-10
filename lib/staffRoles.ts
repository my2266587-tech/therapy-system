/**
 * Shared style + label map for staff roles.
 *
 * The seven role keys must stay in sync with the CHECK constraint on
 * `staff.role` in supabase/schema.sql:
 *   coordinator | instructor | therapist | manager | kabas |
 *   social_worker | other
 */

import type { StaffRole } from '@/types';

export interface RoleStyle {
  label:  string;
  bg:     string;
  text:   string;
  border: string;
  /** Avatar/accent color (single hue). */
  av:     string;
}

export const STAFF_ROLE_STYLE: Record<StaffRole, RoleStyle> = {
  coordinator:   { label: 'רכזת',    bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', av: '#0D9488' },
  instructor:    { label: 'מדריכה',  bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE', av: '#4F46E5' },
  therapist:     { label: 'מטפלת',   bg: '#FDF4FF', text: '#9333EA', border: '#E9D5FF', av: '#9333EA' },
  manager:       { label: 'מנהל',    bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74', av: '#C2410C' },
  kabas:         { label: 'קב"ס',    bg: '#FEFCE8', text: '#A16207', border: '#FDE68A', av: '#A16207' },
  social_worker: { label: 'עו"ס',    bg: '#ECFEFF', text: '#0E7490', border: '#A5F3FC', av: '#0E7490' },
  other:         { label: 'אחר',     bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0', av: '#64748B' },
};

export const STAFF_ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'coordinator',   label: 'רכזת' },
  { value: 'instructor',    label: 'מדריכה' },
  { value: 'therapist',     label: 'מטפלת' },
  { value: 'manager',       label: 'מנהל' },
  { value: 'kabas',         label: 'קב"ס' },
  { value: 'social_worker', label: 'עו"ס' },
  { value: 'other',         label: 'אחר' },
];

export function roleLabel(role: string): string {
  return STAFF_ROLE_STYLE[role as StaffRole]?.label ?? role;
}

/**
 * Source of truth for the enum-shaped role mapping used by the import
 * pipeline. Each entry has the canonical DB `value` and every Hebrew /
 * English label that should map to it. Updating this list updates both
 * the staff and coordinators import targets at once.
 *
 * "רב\"ס" is intentionally listed as an alias for `kabas` — staff in the
 * field write the abbreviation either way.
 */
export const STAFF_ROLE_ENUM_VALUES: { value: StaffRole; labels: string[] }[] = [
  { value: 'coordinator',   labels: ['רכזת', 'רכז', 'מרכזת', 'coordinator'] },
  { value: 'instructor',    labels: ['מדריכה', 'מדריך', 'instructor'] },
  { value: 'therapist',     labels: ['מטפלת', 'מטפל', 'therapist'] },
  { value: 'manager',       labels: ['מנהל', 'מנהלת', 'manager', 'admin'] },
  { value: 'kabas',         labels: ['קב"ס', 'קב״ס', 'קבס', 'רב"ס', 'רב״ס', 'רבס', 'kabas'] },
  { value: 'social_worker', labels: ['עו"ס', 'עו״ס', 'עוס', 'עובדת סוציאלית', 'עובד סוציאלי', 'social_worker', 'social worker'] },
  { value: 'other',         labels: ['אחר', 'אחרת', 'other'] },
];
