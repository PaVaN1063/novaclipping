import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { aiReady } from '@/lib/ai';
import { emptyAi, updateDb } from '@/lib/store';
import { tick } from '@/lib/worker';

// Put a batch's failed posts (and failed AI writing) back in the queue.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;

  const count = await updateDb((d) => {
    let n = 0;
    const now = new Date().toISOString();
    for (const p of d.posts) {
      if (p.batchId === id && p.status === 'failed') {
        p.status = 'queued';
        p.attempts = 0;
        p.error = null;
        p.updatedAt = now;
        n++;
      }
    }
    if (aiReady(d)) {
      for (const c of d.clips) {
        if (c.batchId !== id) continue;
        // Retry failed AI writing; clips from before AI existed get it too,
        // as long as they haven't been sent anywhere yet.
        const sent = d.posts.some((p) => p.clipId === c.id && p.status === 'done');
        if (c.ai?.status === 'failed' || (!c.ai && !sent)) {
          c.ai = emptyAi('pending');
          n++;
        }
      }
    }
    return n;
  });

  void tick();
  return NextResponse.json({ ok: true, count });
}
