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
