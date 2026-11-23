import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { readDb } from '@/lib/store';
import { authUrl, hasAppKeys, redirectUri } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

// Sends you to Google to sign in and allow uploads to your channel.
export async function GET(req: Request) {
  const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, '');
  if (!(await currentUser())) return NextResponse.redirect(`${origin}/login?next=/settings`);

  const db = await readDb();
  if (!hasAppKeys(db)) return NextResponse.redirect(`${origin}/settings?yt=nokeys`);

  const state = randomUUID();
  const res = NextResponse.redirect(authUrl(db.secrets.youtube.clientId!, redirectUri(origin), state));
  res.cookies.set('yt_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
