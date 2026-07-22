import type { TripType } from '@/types';

/** Hebrew display labels for trips.trip_type (see supabase/trips.sql). */
export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  taxi:   'מונית',
  car:    'רכב',
  public: 'תחבורה ציבורית',
};

export const TRIP_TYPE_OPTIONS = (Object.keys(TRIP_TYPE_LABELS) as TripType[])
  .map(value => ({ value, label: TRIP_TYPE_LABELS[value] }));

export function tripTypeLabel(t: string): string {
  return TRIP_TYPE_LABELS[t as TripType] ?? t;
}
