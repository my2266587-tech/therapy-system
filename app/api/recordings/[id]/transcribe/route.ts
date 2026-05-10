/**
 * POST /api/recordings/[id]/transcribe
 *
 *   Transcribes a single recording's audio using OpenAI Whisper. The
 *   route is invoked manually via a "תמלל עכשיו" button — no Cron yet.
 *
 *   Pipeline (atomic from the client's perspective; one HTTP call):
 *     1. Auth + load recording.
 *     2. Validate state — only 'pending' / 'queued' rows with an
 *        audio_url that's a storage path (not an external URL) qualify.
 *     3. Mark the row as `transcribing` so a parallel call can't run
 *        twice and so the UI shows the pulsing chip.
 *     4. Download the audio Blob from the private `recordings` bucket.
 *     5. Send to OpenAI Whisper with language='he'.
 *     6. On success: write transcript_text + status='transcribed' /
 *        processing_status='completed'.
 *     7. On failure: status='failed' / processing_status='failed' /
 *        processing_error=<message>, and return a 500 with the message.
 *
 *   The resulting transcript_text is what the existing
 *   create-summary route reads when the clinician clicks
 *   "צור סיכום פגישה ←" on the same row.
 *
 * Env: OPENAI_API_KEY (required).
 * Auth: Bearer token of an active authorized user.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS } from '@/lib/storage';

/** Whisper has a 25 MB hard limit on the upload. We bail early so the
 *  request doesn't burn time downloading audio it can't transcribe. */
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

/** Vercel function timeout — Whisper takes seconds-to-minutes depending on
 *  audio length. 300s is the Pro plan ceiling; Hobby caps at 60s. */
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY לא מוגדר בשרת — לא ניתן לתמלל.' },
      { status: 503 },
    );
  }

  const { id: recordingId } = await params;
  const supabase = createServerClient();

  /* ── 1. Load + validate ────────────────────────────────────── */
  const { data: rec, error: recErr } = await supabase
    .from('recordings')
    .select('id, audio_url, status, processing_status, transcript_text')
    .eq('id', recordingId)
    .maybeSingle();

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (!rec)   return NextResponse.json({ error: 'הקלטה לא נמצאה' }, { status: 404 });

  if (rec.transcript_text && rec.transcript_text.trim().length > 0) {
    return NextResponse.json(
      { error: 'הקלטה זו כבר תומללה' },
      { status: 409 },
    );
  }
  if (rec.processing_status === 'transcribing') {
    return NextResponse.json(
      { error: 'תמלול בעיצומו — נסי שוב בעוד רגע' },
      { status: 409 },
    );
  }
  if (!rec.audio_url) {
    return NextResponse.json({ error: 'אין קובץ אודיו להקלטה זו' }, { status: 400 });
  }
  // We only support storage paths (e.g. "<patient_id>/<id>.webm"), not
  // external URLs. Manual entries with a full URL aren't auto-transcribed.
  if (/^https?:\/\//i.test(rec.audio_url)) {
    return NextResponse.json(
      { error: 'audio_url הוא URL חיצוני — תמלול אוטומטי תומך רק בקבצים שנשמרו ב-Storage.' },
      { status: 400 },
    );
  }

  /* ── 2. Lock the row ─────────────────────────────────────── */
  await supabase.from('recordings').update({
    status:            'transcribing',
    processing_status: 'transcribing',
    processing_error:  null,
  }).eq('id', recordingId);

  /* ── 3. Download audio from Storage ──────────────────────── */
  const { data: audioBlob, error: dlErr } = await supabase.storage
    .from(BUCKETS.recordings)
    .download(rec.audio_url);

  if (dlErr || !audioBlob) {
    const msg = dlErr?.message ?? 'הורדת קובץ האודיו נכשלה';
    await markFailed(supabase, recordingId, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (audioBlob.size > WHISPER_MAX_BYTES) {
    const msg = `הקובץ גדול מ-25MB (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). Whisper לא יכול לתמלל קבצים גדולים יותר.`;
    await markFailed(supabase, recordingId, msg);
    return NextResponse.json({ error: msg }, { status: 413 });
  }

  /* ── 4. Whisper ──────────────────────────────────────────── */
  const filename = rec.audio_url.split('/').pop() || `recording-${recordingId}.webm`;
  let transcriptText: string;

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const file = await toFile(Buffer.from(arrayBuffer), filename, {
      type: audioBlob.type || 'audio/webm',
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const result = await openai.audio.transcriptions.create({
      file,
      model:    'whisper-1',
      language: 'he',
    });
    transcriptText = result.text ?? '';
    if (!transcriptText.trim()) {
      throw new Error('Whisper החזיר טקסט ריק');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[recordings transcribe] whisper failed:', msg);
    await markFailed(supabase, recordingId, `Whisper: ${msg}`);
    return NextResponse.json({ error: `שגיאת Whisper: ${msg}` }, { status: 500 });
  }

  /* ── 5. Save success ─────────────────────────────────────── */
  const { error: saveErr } = await supabase
    .from('recordings')
    .update({
      transcript_text:   transcriptText,
      status:            'transcribed',
      processing_status: 'completed',
      processing_error:  null,
    })
    .eq('id', recordingId);

  if (saveErr) {
    await markFailed(supabase, recordingId, `DB: ${saveErr.message}`);
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:                true,
    recording_id:      recordingId,
    transcript_chars:  transcriptText.length,
    transcript_words:  transcriptText.split(/\s+/).filter(Boolean).length,
  });
}

/* ── helpers ──────────────────────────────────────────────────────── */

async function markFailed(
  supabase: ReturnType<typeof createServerClient>,
  recordingId: string,
  message: string,
) {
  await supabase.from('recordings').update({
    status:            'failed',
    processing_status: 'failed',
    processing_error:  message,
  }).eq('id', recordingId);
}
