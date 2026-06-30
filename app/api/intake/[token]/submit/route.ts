/**
 * /api/intake/[token]/submit  (PUBLIC — token is the credential)
 *
 *   POST (multipart/form-data) — finalise an intake form by CREATING a new
 *   patient from the answers, then storing the answers, recordings, signature
 *   and a summary PDF linked to that new patient.
 *
 *     answers    : JSON string  [{ id, question, text }]
 *     signature  : PNG file     (optional)
 *     pdf        : PDF file      (the client-built summary, required)
 *     audio_<id> : audio files   (optional, one per recorded question)
 *     internal   : '1' when filled by the therapist from inside the system
 *
 * Filler identity:
 *   • internal='1' + a valid Bearer of an authorized user → filled_by='therapist'
 *   • otherwise                                            → filled_by='patient'
 *
 * The new patient is created with status 'waiting' (a fresh intake = waitlist).
 * Storage (all private, via service role):
 *   • audio     → bucket "recordings"          intake/<form_id>/<qid>.<ext>
 *   • signature → bucket "patient-documents"   <patient_id>/intake-<form_id>-signature.png
 *   • pdf       → bucket "patient-documents"   <patient_id>/<doc_id>.pdf  (+ patient_documents row)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS, friendlyStorageError } from '@/lib/storage';
import { INTAKE_CATEGORY } from '@/lib/intake/questions';

const AUDIO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

function audioExt(type: string): string {
  return AUDIO_EXT[type] ?? 'webm';
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

// Questions whose answers map to structured patient fields / metadata.
const META_LABELS: Record<string, string> = {
  national_id: 'תעודת זהות',
  birth_date: 'תאריך לידה',
  emergency: 'איש קשר לחירום',
};
// Narrative questions collected into the patient's notes field.
const NOTE_IDS = ['reason', 'current_state', 'background', 'medications', 'goals', 'notes'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = createServerClient();

  const { data: form, error: fErr } = await supabase
    .from('intake_forms')
    .select('id, status')
    .eq('token', token)
    .maybeSingle();

  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!form) return NextResponse.json({ error: 'הטופס לא נמצא' }, { status: 404 });
  if (form.status === 'submitted') {
    return NextResponse.json({ error: 'הטופס כבר נשלח' }, { status: 409 });
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  // ── Filler identity ──
  const isInternal = fd.get('internal') === '1';
  let filledBy: 'patient' | 'therapist' = 'patient';
  let filledByEmail: string | null = null;
  if (isInternal) {
    const user = await getAuthorizedUser(req);
    if (user) { filledBy = 'therapist'; filledByEmail = user.email; }
  }

  // ── Parse answers ──
  let answers: { id: string; question: string; text: string }[] = [];
  try {
    const raw = fd.get('answers');
    if (typeof raw === 'string') answers = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'תשובות לא תקינות' }, { status: 400 });
  }

  const byId = (id: string) => (answers.find(a => a.id === id)?.text ?? '').trim();

  const fullName = byId('full_name');
  if (!fullName) {
    return NextResponse.json({ error: 'נא למלא שם מלא ליצירת המטופלת' }, { status: 400 });
  }

  // ── Create the new patient ──
  const importMeta: Record<string, string> = {};
  for (const [qid, label] of Object.entries(META_LABELS)) {
    const v = byId(qid);
    if (v) importMeta[label] = v;
  }
  const notesParts: string[] = [];
  for (const qid of NOTE_IDS) {
    const v = byId(qid);
    if (!v) continue;
    const label = answers.find(a => a.id === qid)?.question ?? qid;
    notesParts.push(`${label}:\n${v}`);
  }

  const { data: patient, error: pErr } = await supabase
    .from('patients')
    .insert({
      full_name: fullName,
      phone: byId('phone') || null,
      home_address: byId('address') || null,
      status: 'waiting',
      notes: notesParts.length ? notesParts.join('\n\n') : null,
      import_metadata: Object.keys(importMeta).length ? importMeta : null,
    })
    .select('id')
    .single();

  if (pErr || !patient) {
    return NextResponse.json({ error: pErr?.message ?? 'שגיאה ביצירת מטופלת' }, { status: 500 });
  }
  const patientId = patient.id as string;

  const uploaded: string[] = []; // for rollback

  // ── Upload per-question audio → recordings bucket ──
  const audioByQid: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('audio_') || !(value instanceof File) || value.size === 0) continue;
    const qid = key.slice('audio_'.length);
    const ext = audioExt(value.type);
    const path = `intake/${form.id}/${qid}.${ext}`;
    const buf = Buffer.from(await value.arrayBuffer());
    const { error } = await supabase.storage
      .from(BUCKETS.recordings)
      .upload(path, buf, { contentType: value.type || 'audio/webm', upsert: true });
    if (error) return await fail(supabase, patientId, uploaded, friendlyStorageError(error.message), 500);
    uploaded.push(`${BUCKETS.recordings}:${path}`);
    audioByQid[qid] = path;
  }

  // ── Upload signature → patient-documents bucket ──
  let signaturePath: string | null = null;
  const sig = fd.get('signature');
  if (sig instanceof File && sig.size > 0) {
    const path = `${patientId}/intake-${form.id}-signature.png`;
    const buf = Buffer.from(await sig.arrayBuffer());
    const { error } = await supabase.storage
      .from(BUCKETS.patientDocuments)
      .upload(path, buf, { contentType: 'image/png', upsert: true });
    if (error) return await fail(supabase, patientId, uploaded, friendlyStorageError(error.message), 500);
    uploaded.push(`${BUCKETS.patientDocuments}:${path}`);
    signaturePath = path;
  }

  // ── Upload summary PDF → patient-documents bucket + patient_documents row ──
  const pdf = fd.get('pdf');
  if (!(pdf instanceof File) || pdf.size === 0) {
    return await fail(supabase, patientId, uploaded, 'חסר קובץ PDF', 400);
  }
  const docId = crypto.randomUUID();
  const pdfPath = `${patientId}/${docId}.pdf`;
  const pdfBuf = Buffer.from(await pdf.arrayBuffer());
  const { error: pdfErr } = await supabase.storage
    .from(BUCKETS.patientDocuments)
    .upload(pdfPath, pdfBuf, { contentType: 'application/pdf', upsert: false });
  if (pdfErr) return await fail(supabase, patientId, uploaded, friendlyStorageError(pdfErr.message), 500);
  uploaded.push(`${BUCKETS.patientDocuments}:${pdfPath}`);

  const now = new Date();
  const fileName = `טופס הצטרפות - ${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.pdf`;

  const { data: docRow, error: docErr } = await supabase
    .from('patient_documents')
    .insert({
      id: docId,
      patient_id: patientId,
      file_name: fileName,
      storage_path: pdfPath,
      mime_type: 'application/pdf',
      file_size: pdf.size,
      category: INTAKE_CATEGORY,
    })
    .select('id')
    .single();

  if (docErr) return await fail(supabase, patientId, uploaded, docErr.message, 500);

  // ── Merge audio paths into answers and finalise the form ──
  const mergedAnswers = answers.map(a => ({
    id: a.id,
    question: a.question,
    text: a.text ?? '',
    audio_path: audioByQid[a.id] ?? null,
  }));

  const { error: updErr } = await supabase
    .from('intake_forms')
    .update({
      patient_id: patientId,
      status: 'submitted',
      filled_by: filledBy,
      filled_by_email: filledByEmail,
      answers: mergedAnswers,
      signature_path: signaturePath,
      pdf_document_id: docRow.id,
      submitted_at: now.toISOString(),
    })
    .eq('id', form.id);

  if (updErr) {
    await supabase.from('patient_documents').delete().eq('id', docId);
    return await fail(supabase, patientId, uploaded, updErr.message, 500);
  }

  return NextResponse.json({ ok: true, filledBy, patientId });
}

/** Roll back the created patient + any uploaded objects, then return an error. */
async function fail(
  supabase: ReturnType<typeof createServerClient>,
  patientId: string | null,
  refs: string[],
  message: string,
  status: number,
) {
  for (const ref of refs) {
    const idx = ref.indexOf(':');
    try { await supabase.storage.from(ref.slice(0, idx)).remove([ref.slice(idx + 1)]); } catch { /* noop */ }
  }
  if (patientId) {
    try { await supabase.from('patients').delete().eq('id', patientId); } catch { /* noop */ }
  }
  return NextResponse.json({ error: message }, { status });
}
