// Signed, short-lived links to a clip's video, so platforms that download videos
// themselves (Instagram) can fetch it from this site. Nobody else can guess them.
import { createHmac, timingSafeEqual } from 'crypto';
import type { Db } from './store';

const secret = () => process.env.AUTH_SECRET || 'nova-clipping-dev-only-secret';
const sign = (clipId: string, exp: number) => createHmac('sha256', secret()).update(`media.${clipId}.${exp}`).digest('base64url');

export function publicBase(db: Db) {
  return (db.prefs.publicUrl || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
}

export function signedMediaUrl(db: Db, clipId: string, hours = 3) {
  const base = publicBase(db);
  if (!base) throw new Error('Set the public address of this site in Settings first.');
  const exp = Date.now() + hours * 3600_000;
  return `${base}/api/media/${clipId}?e=${exp}&s=${sign(clipId, exp)}`;
}

export function verifyMedia(clipId: string, e: string | null, s: string | null) {
  const exp = Number(e);
  if (!s || !exp || exp < Date.now()) return false;
  const want = Buffer.from(sign(clipId, exp));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got);
}
