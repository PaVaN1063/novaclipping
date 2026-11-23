import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';
import { deleteClipFiles } from '@/lib/studio-engine';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name || '').trim().slice(0, 60);
  if (!name) return badRequest('Give the project a name.');
  const ok = await updateDb((d) => { const p = d.projects.find((x) => x.id === id); if (p) p.name = name; return !!p; });
  return ok ? NextResponse.json({ ok: true }) : badRequest('Project not found.', 404);
}

// Delete a project: its clips' files go (scheduled ones stay until posted), records too.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;
  const { readDb } = await import('@/lib/store');
  const db = await readDb();
  if (db.jobs.some((j) => j.projectId === id && (j.status === 'sending' || j.status === 'clipping'))) {
    return badRequest('This project is still clipping. Wait for it to finish.');
  }
  if (db.library.some((c) => c.projectId === id && c.status === 'scheduled')) {
    return badRequest('This project has scheduled clips. They must go out first.');
  }
  await deleteClipFiles(db.library.filter((c) => c.projectId === id).map((c) => c.id));
  await updateDb((d) => {
    d.projects = d.projects.filter((p) => p.id !== id);
    d.jobs = d.jobs.filter((j) => j.projectId !== id);
    d.library = d.library.filter((c) => c.projectId !== id);
  });
  return NextResponse.json({ ok: true });
}
