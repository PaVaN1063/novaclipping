import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { STATE_COOKIE, callbackUrl, loginClient } from '@/lib/google-login';
import { ALLOWED_EMAILS } from '@/lib/role';
import { COOKIE, MAX_AGE, createSession, safeNext } from '@/lib/session';
import { safeEqual } from '@/lib/hmac';

export const dynamic = 'force-dynamic';

// Google sends you back here. Only the allowed emails get a session.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = (process.env.APP_URL || url.origin).replace(/\/+$/, '');
  const fail = (why: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${why}`);
    res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  const saved = (await cookies()).get(STATE_COOKIE)?.value || '';
  const [state, next] = saved.split('|');
  const code = url.searchParams.get('code');
  if (!state || !code || !safeEqual(state, url.searchParams.get('state') || '')) return fail('expired');

  const client = await loginClient();
  if (!client) return fail('setup');

  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: callbackUrl(url.origin),
      grant_type: 'authorization_code',
    }),
  }).then((r) => r.json()).catch(() => null) as { access_token?: string } | null;
  if (!tok?.access_token) return fail('google');

  const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json()).catch(() => null) as { email?: string; email_verified?: boolean } | null;
  const email = (me?.email || '').toLowerCase();
  if (!email || me?.email_verified !== true) return fail('google');
  if (!ALLOWED_EMAILS.includes(email)) return fail('denied');

  const res = NextResponse.redirect(`${origin}${safeNext(next)}`);
  res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(COOKIE, await createSession(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https://'),
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}
