import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';

// Save the Google OAuth Client ID and secret. Stored on this machine only,
// never sent back to the browser.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { clientId?: string; clientSecret?: string } | null;
  const clientId = (body?.clientId || '').trim();
  const clientSecret = (body?.clientSecret || '').trim();

  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    return badRequest('That doesn’t look like a Google Client ID (it ends with .apps.googleusercontent.com).');
  }

  await updateDb((d) => {
    const y = d.secrets.youtube;
    const changed = y.clientId !== clientId;
    y.clientId = clientId;
    if (clientSecret) y.clientSecret = clientSecret;
    if (changed) {
      // A different Google app: the old sign-in no longer applies.
      y.refreshToken = null;
      y.accessToken = null;
      y.expiresAt = null;
      d.connections.youtube = { connected: false, account: null, updatedAt: new Date().toISOString() };
    }
  });
  return NextResponse.json({ ok: true });
}
