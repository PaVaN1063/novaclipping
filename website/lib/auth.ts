import { timingSafeEqual } from 'crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, readSession } from './session';
import { readDb } from './store';

// For API routes: the login check happens here rather than in middleware,
// so large video uploads are never buffered by middleware.
export async function currentUser() {
  // The Nova Studio clipping tool signs its requests with the link key.
  const h = await headers();
  const key = h.get('x-nova-key');
  if (key) {
    const saved = (await readDb()).prefs.linkKey;
    if (!saved) return null;
    const a = Buffer.from(key);
    const b = Buffer.from(saved);
    return a.length === b.length && timingSafeEqual(a, b) ? { user: 'studio' } : null;
  }
  const store = await cookies();
  return readSession(store.get(COOKIE)?.value);
}

export const unauthorized = () => NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });

export const badRequest = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
