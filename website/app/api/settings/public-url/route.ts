import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';
import { tick } from '@/lib/worker';

// Save the public https address of this site, after checking it really reaches this site.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const raw = (body?.url || '').trim().replace(/\/+$/, '');

  if (!raw) {
    await updateDb((d) => {
      d.prefs.publicUrl = null;
    });
    return NextResponse.json({ ok: true });
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return badRequest('That isn’t a web address.');
  }
  if (url.protocol !== 'https:') return badRequest('It must start with https://');

  try {
    const r = await fetch(`${url.origin}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    const j = (await r.json().catch(() => ({}))) as { app?: string };
    if (!r.ok || j.app !== 'nova-clipping') throw new Error();
  } catch {
    return badRequest('Couldn’t reach this site at that address. Is the tunnel running?');
  }

  await updateDb((d) => {
    d.prefs.publicUrl = url.origin;
  });
  void tick();
  return NextResponse.json({ ok: true });
}
