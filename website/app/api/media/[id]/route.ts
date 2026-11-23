import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { verifyMedia } from '@/lib/media';
import { STORAGE_DIR, readDb } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };

// Serves a clip's video only with a valid, unexpired signed link (made for Instagram).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!verifyMedia(id, url.searchParams.get('e'), url.searchParams.get('s'))) {
    return new Response('Link expired or invalid', { status: 403 });
  }

  const db = await readDb();
  const clip = db.clips.find((c) => c.id === id);
  if (!clip?.storedAs) return new Response('Not found', { status: 404 });

  const file = path.join(STORAGE_DIR, clip.storedAs);
  const st = await fs.stat(file).catch(() => null);
  if (!st) return new Response('Not found', { status: 404 });

  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'video/mp4',
      'Content-Length': String(st.size),
      'Cache-Control': 'no-store',
    },
  });
}
