import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { startWorker, tick, workerStatus } from '@/lib/worker';

export const dynamic = 'force-dynamic';

// GET: is the worker running, when did it last check the queue.
export async function GET() {
  if (!(await currentUser())) return unauthorized();
  startWorker();
  return NextResponse.json({ ok: true, ...workerStatus() });
}

// POST: check the queue right now instead of waiting for the next 20s tick.
export async function POST() {
  if (!(await currentUser())) return unauthorized();
  startWorker();
  await tick();
  return NextResponse.json({ ok: true, ...workerStatus() });
}
