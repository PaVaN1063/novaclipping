import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';
import { deleteClipFiles } from '@/lib/studio-engine';

// Several clips at once, and the every-3-days reminder: delete or skip for now.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { action?: string; ids?: string[] } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids.map(String).slice(0, 500) : [];
  const stamp = () => updateDb((d) => { d.studio.lastReminderAt = new Date().toISOString(); });
  switch (body?.action) {
    case 'delete':
      await deleteClipFiles(ids);
      await stamp();
      return NextResponse.json({ ok: true });
    case 'skip':
      await stamp();
      return NextResponse.json({ ok: true });
    case 'remove':
      await updateDb((d) => { d.library = d.library.filter((c) => !(ids.includes(c.id) && c.status === 'deleted')); });
      return NextResponse.json({ ok: true });
    default:
      return badRequest('Unknown action.');
  }
}
