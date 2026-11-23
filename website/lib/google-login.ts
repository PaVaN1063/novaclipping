import { ROLE } from './role';

// Sign in with Google (OpenID Connect, authorization-code flow). Free, and only
// the emails in ALLOWED_EMAILS get a session.
export const STATE_COOKIE = 'nova_login_state';

export async function loginClient(): Promise<{ id: string; secret: string } | null> {
  const id = process.env.AUTH_GOOGLE_ID || '';
  const secret = process.env.AUTH_GOOGLE_SECRET || '';
  if (id && secret) return { id, secret };
  // On your laptop, fall back to the Google app saved for YouTube.
  if (ROLE === 'local') {
    const { readDb } = await import('./store');
    const y = (await readDb()).secrets.youtube;
    if (y.clientId && y.clientSecret) return { id: y.clientId, secret: y.clientSecret };
  }
  return null;
}

export function callbackUrl(origin: string) {
  return `${(process.env.APP_URL || origin).replace(/\/+$/, '')}/api/auth/google/callback`;
}
