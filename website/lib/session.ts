// Signed login cookie. Uses Web Crypto so it works in middleware and in route handlers.
export const COOKIE = 'nova_session';
export const MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

const enc = new TextEncoder();

function secret(): string {
  return process.env.AUTH_SECRET || 'nova-clipping-dev-only-secret';
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

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
  if ((await sign(payload)) !== sig) return null;
  const [user, exp] = payload.split('.');
  if (!user || !exp || Number(exp) < Date.now()) return null;
  return { user: decodeURIComponent(user) };
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}
