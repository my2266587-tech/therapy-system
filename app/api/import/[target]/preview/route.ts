/**
 * POST /api/import/[target]/preview
 *
 *   multipart/form-data with:
 *     file:    the .xlsx / .csv to preview
 *     mapping: (optional) JSON object { [headerName]: fieldKey }
 *
 *   Returns PreviewResult including the suggested + applied mapping,
 *   plus the original raw sheet so the client can re-render the
 *   mapping UI without re-uploading the file.
 *
 * Auth: Bearer token of an active authorized user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAuthorizedUser } from '@/lib/getAdminUser';
import { getTarget } from '@/lib/import/registry';
import { parseImportFile } from '@/lib/import/parse';
import { autoMapHeaders, validateRows } from '@/lib/import/validate';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — safely under Vercel function limits

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ target: string }> },
) {
  const user = await getAuthorizedUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { target: targetKey } = await params;
  const spec = getTarget(targetKey);
  if (!spec) return NextResponse.json({ error: 'יעד ייבוא לא קיים' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'פורמט בקשה לא תקין' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא צורף קובץ' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מ-5MB' }, { status: 413 });
  }

  // Optional mapping override
  let mapping: Record<string, string> = {};
  const mappingRaw = formData.get('mapping');
  if (typeof mappingRaw === 'string' && mappingRaw.trim()) {
    try {
      const parsed = JSON.parse(mappingRaw);
      if (parsed && typeof parsed === 'object') mapping = parsed as Record<string, string>;
    } catch {
      return NextResponse.json({ error: 'mapping אינו JSON תקין' }, { status: 400 });
    }
  }

  let sheet;
  try {
    sheet = await parseImportFile(file);
  } catch (e) {
    return NextResponse.json(
      { error: `שגיאה בקריאת הקובץ: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  if (sheet.headers.length === 0) {
    return NextResponse.json({ error: 'הקובץ ריק או לא מכיל כותרות' }, { status: 400 });
  }

  // If client didn't send a mapping, fall back to auto-suggestion.
  const appliedMapping = Object.keys(mapping).length > 0
    ? mapping
    : autoMapHeaders(sheet.headers, spec);

  const supabase = createServerClient();
  const result   = await validateRows(supabase, spec, sheet, appliedMapping);

  // Return the raw sheet too, so the UI can re-render the mapping table
  // without forcing the user to upload again.
  return NextResponse.json({
    target:    spec.key,
    rawSheet:  sheet,
    fields:    spec.fields.map(f => ({
      key: f.key, label: f.label, required: !!f.required,
      kind: f.kind, hint: f.hint ?? null,
    })),
    preview:   result,
  });
}
