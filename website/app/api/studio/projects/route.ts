import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { newId, updateDb } from '@/lib/store';

export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name || '').trim().slice(0, 60);
  if (!name) return badRequest('Give the project a name.');
  const project = { id: newId(), name, createdAt: new Date().toISOString() };
  await updateDb((d) => { d.projects.unshift(project); });
  return NextResponse.json({ ok: true, project });
}
