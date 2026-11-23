import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { newId, readDb, updateDb, type StudioJob } from '@/lib/store';

// Start clipping a video link or an uploaded video in a project.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { projectId?: string; url?: string; uploadId?: string } | null;
  const db = await readDb();
  const project = db.projects.find((p) => p.id === body?.projectId);
  if (!project) return badRequest('Pick a project first.');
  if (!db.secrets.gemini.apiKey) return badRequest('Add your Gemini key in Settings first.');

  let source: StudioJob['source'];
  const url = (body?.url || '').trim();
  if (url) {
    if (!/^https?:\/\/\S+$/.test(url) || url.length > 500) return badRequest('That link doesn’t look right.');
    source = { kind: 'url', url };
  } else {
    const up = db.uploads.find((u) => u.id === body?.uploadId);
    if (!up?.storedAs) return badRequest('Upload the video first.');
    source = { kind: 'file', uploadId: up.id, fileName: up.fileName };
  }

  const job: StudioJob = {
    id: newId(), projectId: project.id, source, studioJobId: null, status: 'waiting', progress: 0,
    stage: 'Waiting to start', error: null, clipCount: 0, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
  };
  await updateDb((d) => { d.jobs.push(job); });

  // Tell the page if it has to wait for another project.
  const busy = db.jobs.filter((j) => j.status === 'sending' || j.status === 'clipping');
  const waitingFor = busy.length >= db.studio.maxParallel
    ? db.projects.find((p) => p.id === busy[0].projectId)?.name || 'another project'
    : null;
  return NextResponse.json({ ok: true, job, waitingFor, storageFull: db.studio.storageFull });
}
