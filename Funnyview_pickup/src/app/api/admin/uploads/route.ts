import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'INVALID_FORM' }, { status: 400 });
  }
  const file = form.get('file');
  const folderRaw = form.get('folder');
  const folder = typeof folderRaw === 'string' ? folderRaw.replace(/[^a-z0-9_-]/gi, '') : 'misc';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'UNSUPPORTED_TYPE' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  const result = await storage.upload({
    bytes,
    filename: file.name,
    mimeType: file.type,
    folder: folder || 'home',
  });

  return NextResponse.json({ ...result });
}
