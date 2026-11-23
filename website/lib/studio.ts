import { randomBytes } from 'crypto';
import { readDb, updateDb } from './store';

// Where the Nova Studio clipping tool runs. It is a separate app (Docker on
// this laptop for now); the website shows it inside its Studio page.
export const DEFAULT_STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:5175';

export async function studioUrl() {
  return (await readDb()).prefs.studioUrl || DEFAULT_STUDIO_URL;
}

export const newLinkKey = () => `nova_${randomBytes(24).toString('base64url')}`;

// The link key, made on first use.
export async function ensureLinkKey() {
  const cur = (await readDb()).prefs.linkKey;
  if (cur) return cur;
  return updateDb((d) => {
    if (!d.prefs.linkKey) d.prefs.linkKey = newLinkKey();
    return d.prefs.linkKey as string;
  });
}

// Only hand the key back to the Studio's own address, or to a Studio running
// on this computer.
export function safeReturn(raw: string | undefined, saved: string | null | undefined) {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  let same = false;
  try {
    same = !!saved && new URL(saved).origin === u.origin;
  } catch {}
  return local || same ? u : null;
}
