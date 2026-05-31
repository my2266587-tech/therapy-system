/**
 * POST /api/admin/yemot-transcribe-test
 *   Body: { "path": "ivr2:/2/000.wav" }
 *
 *   End-to-end probe of the real pipeline for ONE existing Yemot
 *   recording:
 *     Yemot path → download audio to memory → transcribe → create a
 *     phone_summary_draft → discard the audio.
 *
 *   Nothing audio is persisted: the file is fetched into a Buffer, sent to
 *   the transcription API, and dropped when the request ends. Only the
 *   transcript text and draft fields are stored. The Yemot file itself is
 *   left in place (deletion is a later step).
 *
 * Auth (any one passes — same as yemot-download-test):
 *   - Bearer token of an active authorized user
 *   - Bearer CRON_SECRET
 *   - ?secret= / body secret matching YEMOT_WEBHOOK_SECRET
 *   Not public — missing/wrong credential → 401.
 *
 * Path safety: only `ivr2:/` paths are accepted.
 *
 * Response (success):
 *   { ok: true, draft_id, path, audio_size_bytes, transcript_chars, status }
 * Response (download / transcription failure):
 *   { ok: false, path, error }   (no draft, no stored audio)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { getOpenAI } from '@/lib/assistant/ai';
import { fetchFile, isValidYemotPath, YEMOT_PATH_PREFIX } from '@/lib/yemot';
import { createServerClient } from '@/lib/supabaseServer';
import { toFile } from 'openai';

export const maxDuration = 60;

// Cheap, Hebrew-capable transcription model.
const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';

function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** ?secret= or body secret matching YEMOT_WEBHOOK_SECRET. */
function hasValidWebhookSecret(req: NextRequest, bodySecret: string | null): boolean {
  const expected = process.env.YEMOT_WEBHOOK_SECRET;
  if (!expected) return false;
  if (req.nextUrl.searchParams.get('secret') === expected) return true;
  return bodySecret != null && bodySecret === expected;
}

async function authorize(req: NextRequest, bodySecret: string | null): Promise<boolean> {
  if (isCron(req)) return true;
  if (hasValidWebhookSecret(req, bodySecret)) return true;
  const user = await getAuthorizedUser(req);
  return Boolean(user);
}

interface Body {
  path?: string;
  secret?: string;
}

/** Filename hint for the transcription upload, derived from the path. */
function fileNameFromPath(path: string): string {
  const base = path.split('/').pop();
  return base && base.length > 0 ? base : 'recording.wav';
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Body may be empty if the secret is in the query string — that's fine.
  }

  if (!(await authorize(req, body.secret ?? null))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = (body.path ?? '').trim();
  if (!path) {
    return NextResponse.json(
      { ok: false, error: `path is required (must start with ${YEMOT_PATH_PREFIX})` },
      { status: 400 },
    );
  }
  if (!isValidYemotPath(path)) {
    return NextResponse.json(
      { ok: false, error: `path must be a Yemot file path starting with ${YEMOT_PATH_PREFIX}` },
      { status: 400 },
    );
  }

  // ── 1. Download audio into memory ──────────────────────────────
  const dl = await fetchFile(path);
  if (!dl.ok) {
    return NextResponse.json({ ok: false, path, error: dl.error }, { status: 502 });
  }
  const audioSize = dl.sizeBytes;

  // ── 2. Transcribe (audio buffer never leaves memory) ───────────
  let transcript: string;
  try {
    const openai = getOpenAI();
    const file = await toFile(dl.buffer, fileNameFromPath(path));
    const result = await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      language: 'he',
    });
    transcript = (result.text ?? '').trim();
  } catch (e) {
    console.error('[yemot-transcribe] transcription failed:', (e as Error).message);
    return NextResponse.json(
      { ok: false, path, audio_size_bytes: audioSize, error: `transcription failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  if (!transcript) {
    return NextResponse.json(
      { ok: false, path, audio_size_bytes: audioSize, error: 'empty transcript' },
      { status: 502 },
    );
  }

  // ── 3. Create a draft for manual patient matching ──────────────
  const supabase = createServerClient();
  const { data, error: insErr } = await supabase
    .from('phone_summary_drafts')
    .insert({
      spoken_patient_name: 'צריך שיוך מטופלת',
      match_status:        'not_found',
      status:              'needs_match',
      current_state:       'נוצר מתמלול הקלטה מימות',
      notes:               transcript,
      source_transcript:   transcript,
      source:              'yemot_recording',
    })
    .select('id')
    .single();
  if (insErr) {
    console.error('[yemot-transcribe] draft creation failed:', insErr.message);
    return NextResponse.json(
      { ok: false, path, audio_size_bytes: audioSize, error: `draft creation failed: ${insErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok:               true,
    draft_id:         data.id,
    path,
    audio_size_bytes: audioSize,
    transcript_chars: transcript.length,
    status:           'needs_match',
  });
}
