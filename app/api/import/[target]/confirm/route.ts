/**
 * POST /api/import/[target]/confirm
 *
 *   application/json body:
 *     {
 *       sheet:   RawSheet,              // headers + rows of strings
 *       mapping: { [header]: fieldKey } // exact mapping the user confirmed
 *     }
 *
 *   The server re-runs the same validation pipeline that /preview ran —
 *   we never trust the client's normalized values. Only rows whose
 *   server-side status is 'valid' get inserted; duplicates and errors
 *   are silently skipped (and counted in the response).
 *
 * Auth: Bearer token of an active authorized user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { getTarget } from '@/lib/import/registry';
import { validateRows, insertValidRows } from '@/lib/import/validate';
import type { RawSheet } from '@/lib/import/types';

interface ConfirmBody {
  sheet:   RawSheet;
  mapping: Record<string, string>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ target: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { target: targetKey } = await params;
  const spec = getTarget(targetKey);
  if (!spec) return NextResponse.json({ error: 'יעד ייבוא לא קיים' }, { status: 404 });

  const body = await req.json().catch(() => null) as ConfirmBody | null;
  if (!body?.sheet?.headers || !Array.isArray(body.sheet.rows) || !body.mapping) {
    return NextResponse.json({ error: 'גוף הבקשה חסר sheet/mapping' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Re-validate server-side. The client gets no trust — even if it sent
  // "all rows are valid", we run the same pipeline.
  const preview = await validateRows(supabase, spec, body.sheet, body.mapping);
  const result  = await insertValidRows(supabase, spec, preview);

  return NextResponse.json({
    target:   spec.key,
    inserted: result.inserted,
    skipped:  result.skipped,
    errors:   result.errors,
    summary:  preview.summary,
  });
}
