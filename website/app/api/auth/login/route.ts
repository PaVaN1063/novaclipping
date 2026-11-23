import { NextResponse } from 'next/server';
import { isLocalHost, quickAccessAllowed } from '@/lib/local';
import { COOKIE, MAX_AGE, createSession } from '@/lib/session';

type Body = { username?: string; password?: string; quick?: boolean };

export async function POST(req: Request) {
  const body = ((await req.json().catch(() => ({}))) || {}) as Body;
  const host = req.headers.get('host');
  const local = isLocalHost(host);
  const isProd = process.env.NODE_ENV === 'production';

  const user = process.env.NOVA_USER || 'pavan';
  // The built-in "nova123" only works on this computer. From outside (tunnel, server),
  // a password must be set in .env.local / the server's environment.
  const pass = process.env.NOVA_PASSWORD || (local && !isProd ? 'nova123' : '');

  if (body.quick === true) {
    if (!quickAccessAllowed(host)) {
      return NextResponse.json({ ok: false, error: 'Quick access only works on this computer.' }, { status: 403 });
    }
  } else {
    if (!pass) {
      return NextResponse.json(
        { ok: false, error: 'Sign-in from outside this computer needs a password: set NOVA_PASSWORD in .env.local.' },
        { status: 403 }
      );
    }
    const ok = (body.username || '').trim().toLowerCase() === user.toLowerCase() && body.password === pass;
    if (!ok) return NextResponse.json({ ok: false, error: 'Wrong username or password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd || !local,
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}
