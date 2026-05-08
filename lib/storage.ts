/**
 * Centralized Supabase Storage settings.
 *
 * One file owns the bucket name so upload / list / signed-url / delete all
 * agree. If we ever rename the bucket we touch ONE constant.
 */

export const BUCKETS = {
  /** Per-patient documents (PDF, Word, images). Private. */
  patientDocuments: 'patient-documents',
} as const;

export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Translate a raw Supabase Storage / Postgres error message into a
 * user-friendly Hebrew message. Returns the original message for unknown
 * cases so we never hide useful debug info from logs.
 */
export function friendlyStorageError(raw: string | null | undefined): string {
  if (!raw) return 'שגיאה לא ידועה';
  const m = raw.toLowerCase();

  if (m.includes('bucket not found')) {
    return 'אחסון הקבצים לא הוגדר בשרת. יש להריץ את ה-SQL ליצירת bucket "patient-documents" ב-Supabase.';
  }
  if (m.includes('payload too large') || m.includes('exceeded the maximum')) {
    return 'הקובץ חורג מהמגבלה של 10MB';
  }
  if (m.includes('mime type') && m.includes('not allowed')) {
    return 'סוג הקובץ אינו נתמך';
  }
  if (m.includes('duplicate') || m.includes('already exists')) {
    return 'קובץ בשם זה כבר קיים';
  }
  if (m.includes('jwt') || m.includes('unauthor')) {
    return 'יש להתחבר מחדש';
  }
  if (m.includes('row-level security') || m.includes('rls')) {
    return 'אין הרשאה — בדקי את policies של ה-bucket ב-Supabase';
  }
  return raw;
}
