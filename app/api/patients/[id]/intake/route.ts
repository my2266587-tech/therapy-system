/**
 * /api/patients/[id]/intake
 *
 *   GET  — status of the patient's intake form for the card:
 *          { submitted: { submitted_at, filled_by, pdf_url } | null }
 *   POST — ensure a pending intake form exists and return its token
 *          (reuses an existing pending form so the personal link is stable).
 *
 * Auth: Bearer token of an active authorized user (therapist/admin).
 * The PUBLIC, token-based counterparts live under /api/intake/[token].
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from '@/lib/storage';

function newToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, '') +
    crypto.randomUUID().replace(/-/g, '')
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: patientId } = await params;
  const supabase = createServerClient();

  // Latest SUBMITTED form drives the card status (a freshly-generated pending
  // link must not flip a completed form back to "טרם מולא").
  const { data: form, error } = await supabase
    .from('intake_forms')
    .select('id, status, filled_by, submitted_at, pdf_document_id')
    .eq('patient_id', patientId)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!form) return NextResponse.json({ submitted: null });

  let pdfUrl = '';
  if (form.pdf_document_id) {
    const { data: doc } = await supabase
      .from('patient_documents')
      .select('storage_path')
      .eq('id', form.pdf_document_id)
      .maybeSingle();
    if (doc?.storage_path) {
      const { data: signed } = await supabase.storage
        .from(BUCKETS.patientDocuments)
        .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
      pdfUrl = signed?.signedUrl ?? '';
    }
  }

  return NextResponse.json({
    submitted: {
      submitted_at: form.submitted_at,
      filled_by: form.filled_by,
      pdf_url: pdfUrl,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: patientId } = await params;
  const supabase = createServerClient();

  const { data: patient, error: pErr } = await supabase
    .from('patients').select('id').eq('id', patientId).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

  // Reuse an existing pending form (stable link); otherwise create one.
  const { data: existing } = await supabase
    .from('intake_forms')
    .select('token')
    .eq('patient_id', patientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.token) {
    return NextResponse.json({ token: existing.token });
  }

  const token = newToken();
  const { error: insErr } = await supabase
    .from('intake_forms')
    .insert({ patient_id: patientId, token, status: 'pending' });

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ token }, { status: 201 });
}
