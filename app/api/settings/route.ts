import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { getAdminUser } from '@/lib/getAdminUser';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  mergeSettings,
} from '@/lib/settings/defaults';

const SETTINGS_KEY = 'app';

/**
 * GET /api/settings — returns the merged settings (defaults <- DB overrides).
 *
 * Readable without admin rights: these are non-sensitive UI display labels
 * needed on every page. Falls back to DEFAULT_SETTINGS if the table is missing
 * or empty, so the app never breaks before the migration is applied.
 */
export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      // table missing / RLS / transient — degrade gracefully to defaults
      console.log('[GET /api/settings] falling back to defaults:', error.message);
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    return NextResponse.json(mergeSettings(data?.value));
  } catch (e) {
    console.log('[GET /api/settings] error, returning defaults:', (e as Error).message);
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

/**
 * PUT /api/settings — admin only. Stores the provided settings as overrides.
 * The body is normalised through mergeSettings so only known, valid fields are
 * persisted (locked option values are preserved, unknown keys dropped).
 */
export async function PUT(req: NextRequest) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  const normalised: AppSettings = mergeSettings(body);

  const supabase = createServerClient();
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: SETTINGS_KEY, value: normalised, updated_by: admin.email },
      { onConflict: 'key' },
    );

  if (error) {
    console.log('[PUT /api/settings] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(normalised);
}
