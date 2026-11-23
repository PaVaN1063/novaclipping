import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { STORAGE_DIR, updateDb } from '@/lib/store';

// Delete a batch, its clips, its posts and the stored video files.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;

  const files = await updateDb((db) => {
    const stored = db.clips.filter((c) => c.batchId === id).map((c) => c.storedAs);
    db.batches = db.batches.filter((b) => b.id !== id);
    db.clips = db.clips.filter((c) => c.batchId !== id);
    db.posts = db.posts.filter((p) => p.batchId !== id);
    return stored.filter((f): f is string => !!f);
  });

  await Promise.all(files.map((f) => fs.unlink(path.join(STORAGE_DIR, f)).catch(() => {})));
  return NextResponse.json({ ok: true });
}
