import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { isPlatform, type Platform } from '@/lib/platforms';
import { updateDb } from '@/lib/store';
import { deleteClipFiles, scheduleClip } from '@/lib/studio-engine';

type Body = {
  action?: 'post' | 'approve' | 'hold' | 'delete' | 'remove' | 'edit';
  platforms?: string[];
  at?: string | null; // ISO time; empty = next free slot
  title?: string;
  description?: string;
};

// One clip: post / schedule it, approve, hold, delete its files, remove its record, or edit its text.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Body | null;
  const action = body?.action;

  if (action === 'delete') {
    await deleteClipFiles([id]);
    return NextResponse.json({ ok: true });
  }

  const result = await updateDb((d) => {
    const c = d.library.find((x) => x.id === id);
    if (!c) return 'Clip not found.';
    const now = new Date().toISOString();
    switch (action) {
      case 'remove':
        if (c.status !== 'deleted') return 'Delete the clip first.';
        d.library = d.library.filter((x) => x.id !== id);
        return null;
      case 'hold':
        if (c.status === 'scheduled' || c.status === 'posted' || c.status === 'deleted') return 'This clip can’t be put on hold now.';
        c.status = 'on_hold';
        c.statusAt = now;
        return null;
      case 'approve':
        if (!['confirm', 'approval', 'on_hold'].includes(c.status)) return 'This clip is already approved.';
        c.status = 'ready';
        c.statusAt = now;
        return null;
      case 'edit':
        if (body?.title !== undefined) c.title = String(body.title).trim().slice(0, 100) || c.title;
        if (body?.description !== undefined) c.description = String(body.description).slice(0, 2000);
        return null;
      case 'post': {
        if (!['confirm', 'approval', 'ready', 'on_hold'].includes(c.status)) return 'This clip is already scheduled or posted.';
        if (!c.file) return 'The clip file is gone.';
        const platforms = (body?.platforms?.length ? body.platforms : d.studio.platforms).filter(isPlatform) as Platform[];
        let at: number | null = null;
        if (body?.at) {
          at = Date.parse(body.at);
          if (isNaN(at) || at < Date.now() - 60_000) return 'Pick a time in the future.';
        }
        return scheduleClip(d, c, platforms, at) ? null : 'Connect YouTube or Instagram in Settings first.';
      }
      default:
        return 'Unknown action.';
    }
  });
  return result ? badRequest(result) : NextResponse.json({ ok: true });
}
