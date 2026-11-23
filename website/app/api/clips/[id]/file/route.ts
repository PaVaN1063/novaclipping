import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { startStatus } from '@/lib/platforms';
import { STORAGE_DIR, readDb, updateDb } from '@/lib/store';

export const runtime = 'nodejs';

const EXT = /^\.(mp4|mov|webm|mkv|m4v)$/;

// Receive one clip's video file and stream it to storage/clips/.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;

  const db = await readDb();
  const clip = db.clips.find((c) => c.id === id);
  if (!clip) return badRequest('Clip not found.', 404);
  if (!req.body) return badRequest('No file was sent.');

  const ext = path.extname(clip.fileName).toLowerCase();
  const storedAs = `${clip.id}${EXT.test(ext) ? ext : '.mp4'}`;
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const dest = path.join(STORAGE_DIR, storedAs);

  try {
    await pipeline(Readable.fromWeb(req.body as unknown as NodeReadableStream), createWriteStream(dest));
  } catch {
    await fs.unlink(dest).catch(() => {});
    return badRequest('The upload was interrupted.', 500);
  }

  const { size } = await fs.stat(dest);
  await updateDb((d) => {
    const c = d.clips.find((x) => x.id === id);
    if (!c) return;
    c.storedAs = storedAs;
    c.size = size;
    for (const p of d.posts) {
      if (p.clipId === id && p.status === 'waiting_file') {
        p.status = startStatus(p.platform, p.mode);
        p.updatedAt = new Date().toISOString();
      }
    }
  });

  return NextResponse.json({ ok: true, size });
}
