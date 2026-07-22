/**
 * /api/trips/upload-receipt
 *
 *   POST — upload a single receipt file (image or PDF) for a trip
 *          (multipart/form-data: "file").
 *
 * The trip row may not exist yet (the user picks the file inside the "new
 * trip" modal), so the storage path is keyed by a random id and the form
 * persists {path, name} together with the rest of the trip on save.
 *
 * Bucket reuse: the file goes into the existing private `patient-documents`
 * bucket under a `trips/` prefix — same approach as summary attachments, so
 * no second bucket needs provisioning. RLS is unchanged — the bucket is
 * already service-role-only via this server endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import {
  BUCKETS, SIGNED_URL_TTL_SECONDS, friendlyStorageError, safeExtension,
} from '@/lib/storage';

const BUCKET = BUCKETS.patientDocuments;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Receipts are images or PDF only.
const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ALLOWED_EXT = new Set<string>([
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
]);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'שדה "file" חסר' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מ-10MB' }, { status: 413 });
  }

  const ext = extOf(file.name);
  const mime = file.type || '';
  if (!ALLOWED_MIME.has(mime) && !ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: 'סוג קובץ לא נתמך. תמונה או PDF בלבד' },
      { status: 415 },
    );
  }

  const supabase = createServerClient();

  const randomId = crypto.randomUUID();
  const storagePath = `trips/${randomId}.${safeExtension(file.name)}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime || 'application/octet-stream',
      upsert: false,
    });

  if (upErr) {
    console.error('[trips upload-receipt] storage.upload failed:', upErr.message);
    const friendly = friendlyStorageError(upErr.message);
    const status = /bucket not found/i.test(upErr.message) ? 503 : 500;
    return NextResponse.json({ error: friendly }, { status });
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({
    path: storagePath,
    name: file.name,
    url:  signed?.signedUrl ?? '',
  }, { status: 201 });
}
