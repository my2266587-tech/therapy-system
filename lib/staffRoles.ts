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
