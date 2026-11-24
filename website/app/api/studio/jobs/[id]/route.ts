import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';

// Remove a waiting, failed or finished job from the list (its clips stay).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;
  const ok = await updateDb((d) => {
    const j = d.jobs.find((x) => x.id === id);
    if (!j || j.status === 'sending' || j.status === 'clipping') return false;
    d.jobs = d.jobs.filter((x) => x.id !== id);
    return true;
  });
  return ok ? NextResponse.json({ ok: true }) : badRequest('That job is running or gone.');
}

// Retry a failed job: it goes back in the queue. The engine keeps the
// downloaded video and its transcript for two days, so a retry is quick.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  if (b.action !== 'retry') return badRequest('Unknown action.');
  const ok = await updateDb((d) => {
    const j = d.jobs.find((x) => x.id === id);
    if (!j || j.status !== 'failed') return false;
    j.status = 'waiting'; j.studioJobId = null; j.error = null; j.progress = 0; j.stage = null;
    j.startedAt = null; j.finishedAt = null; j.createdAt = new Date().toISOString();
    return true;
  });
  return ok ? NextResponse.json({ ok: true }) : badRequest('Only a failed job can be retried.');
}
