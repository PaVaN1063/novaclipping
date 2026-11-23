import { timingSafeEqual } from 'crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, readSession } from './session';
import { readDb } from './store';
import { ENGINE_SECRET, ROLE } from './role';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// For API routes: who is asking? The login check happens here rather than in
// middleware alone, so large uploads are never buffered by middleware.
export async function currentUser(): Promise<{ user: string } | null> {
  const h = await headers();

  // The Nova Studio clipping tool signs its requests with the link key.
  const key = h.get('x-nova-key');
  if (key) {
    const saved = (await readDb()).prefs.linkKey;
    return saved && same(key, saved) ? { user: 'studio' } : null;
  }

  if (ROLE === 'engine') {
    // Only the website's own server, holding the shared secret.
    const k = h.get('x-engine-key') || '';
    if (!ENGINE_SECRET || !same(k, ENGINE_SECRET)) return null;
    return { user: h.get('x-nova-user') || 'website' };
  }

  const store = await cookies();
  return readSession(store.get(COOKIE)?.value);
}

export const unauthorized = () => NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });

export const badRequest = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/** A big-file request that carries a signed link for its own path (made by signLink). */
export async function signedLink(req: Request): Promise<boolean> {
  const { verifyPath } = await import('./hmac');
  const u = new URL(req.url);
  return verifyPath(ENGINE_SECRET, u.pathname, u.searchParams.get('t'));
}
