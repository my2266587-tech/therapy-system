import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeStoragePath } from '@/lib/storage';

const ALLOWED_BUCKETS = ['recordings', 'documents'] as const;
type AllowedBucket = typeof ALLOWED_BUCKETS[number];

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const body = await req.json();
  const { bucket, path, expires_in = 3600 } = body as {
    bucket: string;
    path: string;
    expires_in?: number;
  };

  if (!ALLOWED_BUCKETS.includes(bucket as AllowedBucket)) {
    return NextResponse.json({ error: `Bucket '${bucket}' not allowed` }, { status: 400 });
  }

  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  // Normalize: convert old public URLs to plain paths
  const storagePath = normalizeStoragePath(path, bucket);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, expires_in);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message ?? 'Could not generate signed URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
