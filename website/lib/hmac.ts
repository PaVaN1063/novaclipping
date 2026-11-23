// HMAC-SHA256 helpers on Web Crypto, so they work in middleware (edge) and in
// Node route handlers alike.
const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

/** Compare two strings without leaking where they differ. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A link token for one path, valid for `ttlSec` seconds: "<exp>.<sig>". */
export async function signPath(secret: string, path: string, ttlSec: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${exp}.${await hmac(secret, `${path}|${exp}`)}`;
}

export async function verifyPath(secret: string, path: string, token: string | null): Promise<boolean> {
  if (!secret || !token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(secret, `${path}|${exp}`));
}
