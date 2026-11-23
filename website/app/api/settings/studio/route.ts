import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';
import { ensureLinkKey } from '@/lib/studio';

// Studio page: save where the Studio runs, and get the link key to hand to it.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.user === 'studio') return unauthorized();
  const body = ((await req.json().catch(() => null)) || {}) as { studioUrl?: string };
  if (typeof body.studioUrl === 'string') {
    const url = body.studioUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(url)) return badRequest('The Studio address must start with http:// or https://');
    await updateDb((d) => {
      d.prefs.studioUrl = url;
    });
  }
  return NextResponse.json({ ok: true, key: await ensureLinkKey() });
}
