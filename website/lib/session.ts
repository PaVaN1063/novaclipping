// Signed login cookie. Uses Web Crypto so it works in middleware and in route handlers.
export const COOKIE = 'nova_session';
export const MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

import { hmac, safeEqual } from './hmac';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is not set');
  return s || 'nova-clipping-dev-only-secret';
}

const sign = (data: string) => hmac(secret(), data);

export async function createSession(user: string): Promise<string> {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${encodeURIComponent(user)}.${exp}`;
  return `${payload}.${await sign(payload)}`;
}

export async function readSession(token?: string): Promise<{ user: string } | null> {
  if (!token) return null;
  const cut = token.lastIndexOf('.');
  if (cut < 0) return null;
  const payload = token.slice(0, cut);
  const sig = token.slice(cut + 1);
  if (!safeEqual(await sign(payload), sig)) return null;
  const [user, exp] = payload.split('.');
  if (!user || !exp || Number(exp) < Date.now()) return null;
  return { user: decodeURIComponent(user) };
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}
