/**
 * Converts a Supabase Storage value (full public URL OR plain path) to a plain path.
 *
 * Old public URL format:
 *   https://XXXX.supabase.co/storage/v1/object/public/{bucket}/{path}
 * New stored format (plain path):
 *   {path}   e.g. "recordings/abc123/1234567890.webm"
 *
 * Safe to call on values that are already paths — returns them unchanged.
 */
export function normalizeStoragePath(value: string, bucket: string): string {
  const marker = `/object/public/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx !== -1) return value.slice(idx + marker.length);
  return value;
}
