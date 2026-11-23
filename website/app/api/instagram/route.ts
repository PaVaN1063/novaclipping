import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { connectWithToken, disconnectInstagram } from '@/lib/instagram';
import { tick } from '@/lib/worker';

// POST { token } connects Instagram; POST { disconnect: true } disconnects it.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { token?: string; disconnect?: boolean } | null;
  if (!body) return badRequest('Bad request.');

  if (body.disconnect) {
    await disconnectInstagram();
    return NextResponse.json({ ok: true });
  }

  const token = (body.token || '').trim();
  if (token.length < 20) return badRequest('Paste the Instagram access token.');
  try {
    const me = await connectWithToken(token);
    void tick(); // send anything that was waiting for Instagram
    return NextResponse.json({ ok: true, username: me.username, accountType: me.accountType });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : 'Could not connect Instagram.');
  }
}
