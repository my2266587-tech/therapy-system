/**
 * POST /api/recordings/[id]/create-summary
 *
 *   Creates a draft session_summaries row from a recording's AI output and
 *   links it back via recordings.summary_id. The recording transitions to
 *   status='draft_ready'. The clinician then opens the new summary in the
 *   regular editor, reviews it, and saves it as final.
 *
 *   When `ai_summary_raw` is present (a future Whisper/Claude pipeline will
 *   populate it), its fields are mapped into the summary structure. For now
 *   the summary may be created from `transcript_text` only — that text
 *   lands in main_topics as a starting point for the clinician.
 *
 * Auth: Bearer token of an active authorized user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';

interface AISummaryShape {
  main_topics?:        string;
  treatment_actions?:  string;
  current_state?:      string;
  next_steps?:         string;
  tasks_given?:        string;
  progress?:           string;
  difficulties?:       string;
  notes?:              string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: recordingId } = await params;
  const supabase = createServerClient();

  /* 1. Load the recording */
  const { data: recording, error: recErr } = await supabase
    .from('recordings')
    .select('id, patient_id, recorded_at, transcript, transcript_text, ai_summary_raw, summary_id')
    .eq('id', recordingId)
    .maybeSingle();

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (!recording) {
    return NextResponse.json({ error: 'הקלטה לא נמצאה' }, { status: 404 });
  }

  /* 2. Idempotency: if a summary was already created from this recording,
   *    return its id rather than creating a duplicate. */
  if (recording.summary_id) {
    return NextResponse.json({
      summary_id: recording.summary_id,
      reused: true,
    });
  }

  /* 3. Build the draft from the AI output (when present). When absent we
   *    drop the transcript into main_topics as a starting point. */
  const ai = (recording.ai_summary_raw ?? null) as AISummaryShape | null;
  const transcript = recording.transcript_text ?? recording.transcript ?? null;

  const recordedDate = new Date(recording.recorded_at);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${recordedDate.getFullYear()}-${pad(recordedDate.getMonth() + 1)}-${pad(recordedDate.getDate())}`;

  const draft: Record<string, unknown> = {
    patient_id:        recording.patient_id,
    date:              ymd,
    main_topics:       ai?.main_topics       ?? (transcript ? `[תמלול מלא]\n${transcript}` : null),
    treatment_actions: ai?.treatment_actions ?? null,
    current_state:     ai?.current_state     ?? null,
    next_steps:        ai?.next_steps        ?? null,
    tasks_given:       ai?.tasks_given       ?? null,
    progress:          ai?.progress          ?? null,
    difficulties:      ai?.difficulties      ?? null,
    notes:             ai?.notes             ?? null,
  };

  /* 4. Insert + link */
  const { data: inserted, error: insErr } = await supabase
    .from('session_summaries')
    .insert(draft)
    .select('id')
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { error: linkErr } = await supabase
    .from('recordings')
    .update({
      summary_id: inserted.id,
      status:     'draft_ready',
    })
    .eq('id', recordingId);

  if (linkErr) {
    // Best-effort cleanup so we don't leave an orphan summary on failure.
    await supabase.from('session_summaries').delete().eq('id', inserted.id);
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({
    summary_id: inserted.id,
    reused:     false,
  }, { status: 201 });
}
