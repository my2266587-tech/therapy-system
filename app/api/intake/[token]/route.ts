/**
 * /api/intake/[token]  (PUBLIC — no auth)
 *
 *   GET — returns the form for the external personal link:
 *         { status, alreadySubmitted, patientName, questions }
 *
 * The token maps server-side to a patient; we expose only the patient's name
 * for a greeting and NEVER the patient_id. Access goes through the service
 * role (the table is RLS deny-all to anon).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { INTAKE_QUESTIONS } from '@/lib/intake/questions';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = createServerClient();

  const { data: form, error } = await supabase
    .from('intake_forms')
    .select('status, patient:patient_id(full_name)')
    .eq('token', token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!form) return NextResponse.json({ error: 'הטופס לא נמצא' }, { status: 404 });

  const patient = form.patient as unknown as { full_name: string } | null;

  return NextResponse.json({
    status: form.status,
    alreadySubmitted: form.status === 'submitted',
    patientName: patient?.full_name ?? '',
    questions: INTAKE_QUESTIONS,
  });
}
