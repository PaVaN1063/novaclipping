// Instagram (Instagram API with Instagram Login): connect with an access token,
// then publish Reels. Instagram downloads the video from a signed link to this site.
import { publicBase, signedMediaUrl } from './media';
import { finalText, type Publisher } from './publishing';
import { readDb, updateDb, type Db } from './store';

const GRAPH = 'https://graph.instagram.com';
const V = process.env.IG_API_VERSION || 'v26.0';
const DAY = 86_400_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function igError(r: Response) {
  try {
    const j = (await r.json()) as { error?: { message?: string; error_user_msg?: string } };
    return j.error?.error_user_msg || j.error?.message || `Instagram error ${r.status}`;
  } catch {
    return `Instagram error ${r.status}`;
  }
}

export function isInstagramConnected(db: Db) {
  return db.connections.instagram.connected && !!db.secrets.instagram.token && !!publicBase(db);
}

// Check the token, find the account, and save it.
export async function connectWithToken(token: string) {
  const r = await fetch(`${GRAPH}/${V}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) throw new Error(await igError(r));
  const me = (await r.json()) as { id?: string; user_id?: string; username?: string; account_type?: string };
  const userId = me.user_id || me.id;
  if (!userId) throw new Error('Instagram did not return the account ID.');

  const now = Date.now();
  await updateDb((d) => {
    d.secrets.instagram = { token, userId, savedAt: now, expiresAt: now + 60 * DAY };
    d.connections.instagram = { connected: true, account: me.username ? `@${me.username}` : userId, updatedAt: new Date().toISOString() };
  });
  return { username: me.username, accountType: me.account_type };
}

export async function disconnectInstagram() {
  await updateDb((d) => {
    d.secrets.instagram = { token: null, userId: null, savedAt: null, expiresAt: null };
    d.connections.instagram = { connected: false, account: null, updatedAt: new Date().toISOString() };
  });
}

// Long-lived tokens last about 60 days; refresh well before that (Instagram only allows it once a token is a day old).
async function freshToken(db: Db) {
  const s = db.secrets.instagram;
  if (!s.token) throw new Error('Instagram is not connected.');
  const now = Date.now();
  const age = now - (s.savedAt || now);
  const left = (s.expiresAt || now) - now;
  if (age > DAY && left < 20 * DAY) {
    const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(s.token)}`);
    if (r.ok) {
      const j = (await r.json()) as { access_token?: string; expires_in?: number };
      if (j.access_token) {
        await updateDb((d) => {
          d.secrets.instagram.token = j.access_token!;
          d.secrets.instagram.savedAt = now;
          d.secrets.instagram.expiresAt = now + (j.expires_in ?? 60 * 86400) * 1000;
        });
        return j.access_token;
      }
    } else if (left <= 0) {
      await updateDb((d) => {
        d.connections.instagram.connected = false;
      });
      throw new Error('Instagram sign-in expired. Reconnect it in Settings.');
    }
  }
  return s.token;
}

async function post(path: string, params: Record<string, string>) {
  const r = await fetch(`${GRAPH}/${V}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!r.ok) throw new Error(await igError(r));
  return (await r.json()) as { id?: string };
}

export const instagramPublisher: Publisher = {
  isConnected: isInstagramConnected,

  async publish({ clip, batch }) {
    const db = await readDb();
    const token = await freshToken(db);
    const userId = db.secrets.instagram.userId!;
    const text = finalText(clip, batch);

    // 1. Create the Reel container; Instagram fetches the video from our signed link.
    const container = await post(`${userId}/media`, {
      media_type: 'REELS',
      video_url: signedMediaUrl(db, clip.id),
      caption: text.caption.slice(0, 2200),
      share_to_feed: 'true',
      access_token: token,
    });
    if (!container.id) throw new Error('Instagram did not create the Reel.');

    // 2. Wait for Instagram to finish processing the video (up to ~10 minutes).
    let status = 'IN_PROGRESS';
    for (let i = 0; i < 120 && status === 'IN_PROGRESS'; i++) {
      await sleep(5000);
      const r = await fetch(`${GRAPH}/${V}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error(await igError(r));
      const j = (await r.json()) as { status_code?: string; status?: string };
      status = j.status_code || 'IN_PROGRESS';
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Instagram could not process the video (${j.status || status}).`);
    }
    if (status !== 'FINISHED' && status !== 'PUBLISHED') throw new Error('Instagram took too long to process the video.');

    // 3. Publish it.
    const published = await post(`${userId}/media_publish`, { creation_id: container.id, access_token: token });
    if (!published.id) throw new Error('Instagram did not publish the Reel.');

    let url: string | undefined;
    try {
      const r = await fetch(`${GRAPH}/${V}/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`);
      if (r.ok) url = ((await r.json()) as { permalink?: string }).permalink;
    } catch {}
    return { externalId: published.id, url };
  },
};
