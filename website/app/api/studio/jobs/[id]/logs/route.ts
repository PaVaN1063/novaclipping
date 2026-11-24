import { NextResponse } from 'next/server';
import os from 'os';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { readDb } from '@/lib/store';
import { cleanLogs, readLogs } from '@/lib/job-insight';
import { studioFetch } from '@/lib/studio-engine';

// Live details of one clipping job: steps, estimate, cleaned engine log and
// how busy the VM is. Links, IPs and key-like text are removed on the VM
// before anything is sent to the browser.
const seen = new Map<string, { count: number; at: number }>();

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;
  const job = (await readDb()).jobs.find((j) => j.id === id);
  if (!job) return badRequest('That job is gone.');

  let logs: string[] = [];
  let engineStatus = job.status === 'done' ? 'completed' : job.status === 'failed' ? 'failed' : job.status === 'clipping' ? 'processing' : 'queued';
  let engineReachable = true;
  if (job.studioJobId) {
    try {
      const st = (await (await studioFetch(`/api/status/${job.studioJobId}`)).json()) as { status: string; logs?: string[] };
      logs = st.logs || [];
      engineStatus = st.status || engineStatus;
    } catch {
      engineReachable = false;
    }
  }

  const insight = readLogs(logs, engineStatus, job.source.kind === 'file', 6);
  const now = Date.now();
  const prev = seen.get(id);
  if (!prev || prev.count !== logs.length) seen.set(id, { count: logs.length, at: now });
  const quietFor = Math.round((now - (seen.get(id)?.at || now)) / 1000);
  const running = job.status === 'clipping' || job.status === 'sending';

  const cores = os.cpus().length || 1;
  const load = os.loadavg()[0];
  const start = job.startedAt ? Date.parse(job.startedAt) : Date.parse(job.createdAt);
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now;

  return NextResponse.json({
    ok: true,
    status: job.status,
    stage: job.stage,
    error: job.error,
    steps: insight.steps,
    etaSeconds: running ? insight.etaSeconds : null,
    elapsedSeconds: Math.max(0, Math.round((end - start) / 1000)),
    quietSeconds: running ? quietFor : 0,
    stuck: running && quietFor > 600,
    engineReachable,
    logs: cleanLogs(logs),
    vm: {
      cpuPercent: Math.min(100, Math.round((load / cores) * 100)),
      cores,
      memUsedGb: +((os.totalmem() - os.freemem()) / 1e9).toFixed(1),
      memTotalGb: +(os.totalmem() / 1e9).toFixed(1),
    },
  });
}
