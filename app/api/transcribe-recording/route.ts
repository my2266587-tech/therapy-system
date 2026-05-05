import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { normalizeStoragePath } from '@/lib/storage';
import { createAdminClient } from '@/lib/supabase/admin';

type SummaryDraft = {
  current_state: string;
  main_topics: string;
  treatment_actions: string;
  next_steps: string;
  tasks_given: string;
  progress: string;
  difficulties: string;
  notes: string;
};

function emptyDraft(): SummaryDraft {
  return {
    current_state: '',
    main_topics: '',
    treatment_actions: '',
    next_steps: '',
    tasks_given: '',
    progress: '',
    difficulties: '',
    notes: '',
  };
}

const PARSE_PROMPT = `להלן תמלול של פגישת טיפול. חלקי את התוכן לפי הכותרות הבאות:
- מצב נוכחי → current_state
- נושאים חשובים שעלו → main_topics
- מה עשינו בטיפול → treatment_actions
- עם מה מתחילים בפגישה הבאה → next_steps
- משימות שקיבלה → tasks_given
- התקדמות → progress
- קושי בהתקדמות → difficulties
- הערות → notes

החזירי JSON בלבד, ללא כל טקסט נוסף. אם אין תוכן לכותרת — השאירי ערך ריק.
פורמט: {"current_state":"...","main_topics":"...","treatment_actions":"...","next_steps":"...","tasks_given":"...","progress":"...","difficulties":"...","notes":"..."}

תמלול:`;

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAuth();
  if (authErr) return authErr;

  try {
    const { audio_url } = await req.json();
    if (!audio_url) {
      return NextResponse.json({ error: 'audio_url נדרש' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    // ── Mock mode (no API key) ──────────────────────────────────
    if (!apiKey) {
      return NextResponse.json({
        ...emptyDraft(),
        current_state: 'זוהי טיוטה לדוגמה. הוסיפי OPENAI_API_KEY ב-.env.local לתמלול אמיתי.',
        notes: 'במצב בדיקה — כל השדות פתוחים לעריכה לפני שמירה.',
        _mock: true,
      });
    }

    // ── Step 1: Resolve storage path → signed URL → fetch audio ─
    const storagePath = normalizeStoragePath(audio_url, 'recordings');
    const admin = createAdminClient();
    const { data: signedData, error: signedErr } = await admin.storage
      .from('recordings')
      .createSignedUrl(storagePath, 300);
    if (signedErr || !signedData?.signedUrl) throw new Error('לא ניתן ליצור כתובת גישה להקלטה');

    const audioRes = await fetch(signedData.signedUrl);
    if (!audioRes.ok) throw new Error('לא ניתן להוריד את קובץ ההקלטה');
    const audioBuffer = await audioRes.arrayBuffer();
    const contentType = audioRes.headers.get('content-type') ?? 'audio/webm';

    // ── Step 2: Whisper transcription ───────────────────────────
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: contentType }), 'recording.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'he');
    formData.append('response_format', 'text');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      throw new Error(`Whisper: ${errText}`);
    }

    const transcript = (await whisperRes.text()).trim();
    if (!transcript) return NextResponse.json(emptyDraft());

    // ── Step 3: GPT-4o-mini — parse transcript into sections ────
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: `${PARSE_PROMPT}\n${transcript}` }],
      }),
    });

    if (!gptRes.ok) {
      const errText = await gptRes.text();
      throw new Error(`GPT: ${errText}`);
    }

    const gptJson = await gptRes.json();
    const raw = JSON.parse(gptJson.choices?.[0]?.message?.content ?? '{}');

    const draft: SummaryDraft = {
      current_state:     raw.current_state     ?? '',
      main_topics:       raw.main_topics       ?? '',
      treatment_actions: raw.treatment_actions ?? '',
      next_steps:        raw.next_steps        ?? '',
      tasks_given:       raw.tasks_given       ?? '',
      progress:          raw.progress          ?? '',
      difficulties:      raw.difficulties      ?? '',
      notes:             raw.notes             ?? '',
    };

    return NextResponse.json(draft);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'שגיאת שרת' },
      { status: 500 },
    );
  }
}
