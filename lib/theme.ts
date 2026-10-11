/**
 * Shared design tokens — the single source for the app's colors.
 *
 * Pages use inline styles, so they import these instead of redefining their
 * own palette (`const C = { … }`), which is how 29 copies drifted apart.
 * New UI: import { colors as C } from '@/lib/theme'.
 */
export const colors = {
  bg:        '#F6F8FB',   // page background
  card:      '#FFFFFF',   // card / panel surface
  border:    '#E8ECF0',   // card borders, dividers
  accent:    '#0D9488',   // brand teal: primary buttons, active states
  accentSub: '#F0FDF9',   // tinted teal background
  accentRim: '#99F6E4',   // teal border on tinted backgrounds
  text:      '#1A2332',   // primary text
  sub:       '#64748B',   // secondary text
  muted:     '#94A3B8',   // hints, placeholders, meta
  danger:    '#DC2626',   // destructive actions, errors
  shadow:    '0 1px 4px rgba(0,0,0,0.05)',
} as const;
