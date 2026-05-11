/**
 * Centralized Supabase Storage settings.
 *
 * One file owns the bucket name so upload / list / signed-url / delete all
 * agree. If we ever rename the bucket we touch ONE constant.
 */

export const BUCKETS = {
  /** Per-patient documents (PDF, Word, images). Private. */
  patientDocuments: 'patient-documents',
  /** Per-staff documents (PDF, Word, images). Private. */
  staffDocuments: 'staff-documents',
  /** Audio captured by RecordingWidget. Private. */
  recordings: 'recordings',
} as const;

export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Audio MIME types accepted by the recordings upload API. Mirrors the
 *  allowed_mime_types set on the storage bucket. */
export const RECORDING_AUDIO_MIME = [
  'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg',
  'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
] as const;

export const RECORDING_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Extract a Supabase-Storage-safe extension from an uploaded file name.
 *
 * Supabase Storage rejects object keys with non-ASCII / certain special
 * characters ("Invalid key" 400). Hebrew filenames and filenames with
 * spaces blow up this guardrail, so we never use the original name
 * inside the storage path — we only keep the extension, sanitized to
 * lowercase a-z / 0-9, max 8 chars. The full original filename lives
 * in the row's `file_name` column for display.
 *
 *   safeExtension('אבחון פסיכודיאגנוסטי.docx')  →  'docx'
 *   safeExtension('contract (v2).pdf')          →  'pdf'
 *   safeExtension('weird.name.tar.gz')          →  'gz'
 *   safeExtension('noext')                      →  'bin'   (fallback)
 *   safeExtension('.HEIC')                      →  'heic'
 */
export function safeExtension(fileName: string, fallback = 'bin'): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return fallback;
  const raw = fileName.slice(dot + 1).toLowerCase();
  const clean = raw.replace(/[^a-z0-9]/g, '').slice(0, 8);
  return clean || fallback;
}

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
  if (m.includes('invalid key') || m.includes('not valid')) {
    return 'שם הקובץ מכיל תווים שאינם נתמכים. הקובץ נשמר במזהה אקראי — נסי לרענן ולהעלות שוב.';
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
