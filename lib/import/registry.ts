/**
 * Central registry of import targets.
 *
 * Adding a new target:
 *   1. Define a TargetSpec in lib/import/targets/<your-target>.ts
 *   2. Add it to TARGETS below
 *   3. (No API or UI changes needed — the registry drives both.)
 */

import type { TargetSpec } from './types';
import { PATIENTS_TARGET } from './targets/patients';
import { SESSIONS_TARGET } from './targets/sessions';
import { STAFF_TARGET    } from './targets/staff';
import { PAYMENTS_TARGET } from './targets/payments';
import { EXPENSES_TARGET } from './targets/expenses';

export const TARGETS: TargetSpec[] = [
  PATIENTS_TARGET,
  SESSIONS_TARGET,
  STAFF_TARGET,
  PAYMENTS_TARGET,
  EXPENSES_TARGET,
];

const BY_KEY = new Map(TARGETS.map(t => [t.key, t]));

export function getTarget(key: string): TargetSpec | null {
  return BY_KEY.get(key) ?? null;
}
