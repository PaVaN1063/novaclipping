import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { STATE_COOKIE, callbackUrl, loginClient } from '@/lib/google-login';
import { safeNext } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = (process.env.APP_URL || url.origin).replace(/\/+$/, '');
  const client = await loginClient();
  if (!client) return NextResponse.redirect(`${origin}/login?error=setup`);

  const state = randomBytes(24).toString('base64url');
  const next = safeNext(url.searchParams.get('next'));
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', client.id);
  auth.searchParams.set('redirect_uri', callbackUrl(url.origin));
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'openid email profile');
  auth.searchParams.set('state', state);
  auth.searchParams.set('prompt', 'select_account');

  const res = NextResponse.redirect(auth.toString());
  res.cookies.set(STATE_COOKIE, `${state}|${next}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https://'),
    path: '/',
    maxAge: 600,
  });
  return res;
}
