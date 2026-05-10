/**
 * POST /api/recordings
 *
 *   multipart/form-data with:
 *     file              audio blob (audio/webm, audio/mp4, etc.)
 *     patient_id        UUID — required (recordings.patient_id is NOT NULL)
 *     duration_seconds  optional integer
 *     recorded_at       optional ISO timestamp; defaults to now
 *
 *   Pipeline:
 *     1. Validate auth + the file (MIME + size).
 *     2. Generate a recording UUID and upload the blob to the private
 *        `recordings` bucket at `<patient_id>/<recording_id>.<ext>`.
 *     3. Insert a recordings row with:
 *          status              = 'pending'
 *          processing_status   = 'queued'
 *          audio_url           = the storage path (NOT a public URL)
 *          duration_seconds    = if supplied
 *
 *   The audio_url column intentionally stores the storage *path*, not a
 *   public URL — the bucket is private, so any consumer that wants to
 *   play the audio must mint a signed URL on demand. This matches the
 *   pattern used by patient-documents.
 *
 *   On insert failure the storage object is rolled back so we never
 *   leak orphan audio.
 *
 * Auth: Bearer token of an active authorized user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import {
  BUCKETS, RECORDING_AUDIO_MIME, RECORDING_MAX_BYTES, friendlyStorageError,
} from '@/lib/storage';

const BUCKET = BUCKETS.recordings;

const ALLOWED_EXT: Record<string, string> = {
  'audio/webm':   'webm',
  'audio/mp4':    'm4a',
  'audio/x-m4a':  'm4a',
  'audio/mpeg':   'mp3',
  'audio/mp3':    'mp3',
  'audio/wav':    'wav',
  'audio/x-wav':  'wav',
  'audio/ogg':    'ogg',
};

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'פורמט בקשה לא תקין' }, { status: 400 });
  }

  /* ── input parsing ──────────────────────────────────────────── */
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא צורף קובץ אודיו' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 });
  }
  if (file.size > RECORDING_MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ חורג מהמגבלה של 100MB' }, { status: 413 });
  }

  const mime = file.type || 'audio/webm';
  if (!(RECORDING_AUDIO_MIME as readonly string[]).includes(mime)) {
    return NextResponse.json({
      error: `סוג קובץ אודיו לא נתמך: ${mime}`,
    }, { status: 415 });
  }

  const patientId = (formData.get('patient_id') ?? '').toString().trim();
  if (!patientId) {
    return NextResponse.json({ error: 'יש לבחור מטופלת לפני שמירה' }, { status: 400 });
  }

  const durationRaw = (formData.get('duration_seconds') ?? '').toString().trim();
  const duration_seconds = durationRaw ? Number(durationRaw) : null;
  if (durationRaw && !Number.isFinite(duration_seconds)) {
    return NextResponse.json({ error: 'duration_seconds חייב להיות מספר' }, { status: 400 });
  }

  const recordedAtRaw = (formData.get('recorded_at') ?? '').toString().trim();
  const recorded_at = recordedAtRaw || new Date().toISOString();

  const supabase = createServerClient();

  /* ── verify patient exists ──────────────────────────────────── */
  const { data: patient, error: pErr } = await supabase
    .from('patients').select('id').eq('id', patientId).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!patient) return NextResponse.json({ error: 'מטופלת לא נמצאה' }, { status: 404 });

  /* ── upload audio ───────────────────────────────────────────── */
  const recordingId = crypto.randomUUID();
  const ext = ALLOWED_EXT[mime] ?? 'webm';
  const storagePath = `${patientId}/${recordingId}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });

  if (upErr) {
    console.error('[recordings POST] storage.upload failed:', upErr.message);
    const friendly = friendlyStorageError(upErr.message);
    const status = /bucket not found/i.test(upErr.message) ? 503 : 500;
    return NextResponse.json({ error: friendly }, { status });
  }

  /* ── create recordings row ──────────────────────────────────── */
  const { data: row, error: insErr } = await supabase
    .from('recordings')
    .insert({
      id:                 recordingId,
      patient_id:         patientId,
      audio_url:          storagePath,    // private path, not a URL
      duration_seconds:   duration_seconds,
      recorded_at:        recorded_at,
      status:             'pending',
      processing_status:  'queued',
    })
    .select('id, patient_id, recorded_at, duration_seconds, status, processing_status')
    .single();

  if (insErr) {
    // Roll back the storage object — never leak orphan audio.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json(row, { status: 201 });
}
