// YouTube: Google sign-in (OAuth) and video uploads.
import { promises as fs } from 'fs';
import { finalText, type Publisher } from './publishing';
import { readDb, updateDb, type Db } from './store';

export const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly', // to read the channel name
];

export function redirectUri(origin: string) {
  return `${(process.env.APP_URL || origin).replace(/\/$/, '')}/api/youtube/callback`;
}

export function hasAppKeys(db: Db) {
  return !!(db.secrets.youtube.clientId && db.secrets.youtube.clientSecret);
}

export function isYoutubeConnected(db: Db) {
  return db.connections.youtube.connected && !!db.secrets.youtube.refreshToken;
}

export function authUrl(clientId: string, redirect: string, state: string) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: YT_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString();
  return u.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = (await r.json().catch(() => ({}))) as TokenResponse;
  if (!r.ok || !j.access_token) {
    const err = new Error(j.error_description || j.error || `Google token error ${r.status}`);
    (err as Error & { code?: string }).code = j.error;
    throw err;
  }
  return j as Required<Pick<TokenResponse, 'access_token'>> & TokenResponse;
}

async function apiError(r: Response) {
  try {
    const j = (await r.json()) as { error?: { message?: string } };
    return j.error?.message || `YouTube error ${r.status}`;
  } catch {
    return `YouTube error ${r.status}`;
  }
}

// After Google sends the user back: swap the code for tokens and read the channel.
export async function finishConnect(code: string, redirect: string) {
  const db = await readDb();
  const s = db.secrets.youtube;
  if (!s.clientId || !s.clientSecret) throw new Error('Add your Google Client ID and secret first.');

  const t = await tokenRequest({
    code,
    client_id: s.clientId,
    client_secret: s.clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });

  const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  if (!ch.ok) throw new Error(await apiError(ch));
  const chData = (await ch.json()) as { items?: { id: string; snippet?: { title?: string; customUrl?: string } }[] };
  const channel = chData.items?.[0];
  if (!channel) throw new Error('This Google account has no YouTube channel.');

  await updateDb((d) => {
    const y = d.secrets.youtube;
    y.accessToken = t.access_token;
    y.expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000;
    if (t.refresh_token) y.refreshToken = t.refresh_token;
    y.channelId = channel.id;
    d.connections.youtube = {
      connected: true,
      account: channel.snippet?.customUrl || channel.snippet?.title || channel.id,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function disconnect() {
  await updateDb((d) => {
    const y = d.secrets.youtube;
    y.refreshToken = null;
    y.accessToken = null;
    y.expiresAt = null;
    y.channelId = null;
    d.connections.youtube = { connected: false, account: null, updatedAt: new Date().toISOString() };
  });
}

async function accessToken(): Promise<string> {
  const db = await readDb();
  const s = db.secrets.youtube;
  if (s.accessToken && s.expiresAt && s.expiresAt > Date.now() + 60_000) return s.accessToken;
  if (!s.refreshToken || !s.clientId || !s.clientSecret) throw new Error('YouTube is not connected.');
  try {
    const t = await tokenRequest({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.refreshToken,
      grant_type: 'refresh_token',
    });
    await updateDb((d) => {
      d.secrets.youtube.accessToken = t.access_token;
      d.secrets.youtube.expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000;
      if (t.refresh_token) d.secrets.youtube.refreshToken = t.refresh_token;
    });
    return t.access_token;
  } catch (e) {
    if ((e as { code?: string }).code === 'invalid_grant') {
      // Sign-in expired or was revoked: mark as not connected so posts wait.
      await updateDb((d) => {
        d.connections.youtube.connected = false;
        d.secrets.youtube.refreshToken = null;
        d.secrets.youtube.accessToken = null;
      });
      throw new Error('YouTube sign-in expired. Reconnect it in Settings.');
    }
    throw e;
  }
}

const clean = (s: string, max: number) => s.replace(/[<>]/g, '').trim().slice(0, max);

// Upload one video. Drafts: Private. Scheduled: Private + publishAt (YouTube makes it
// public at that time). If the slot has already passed, it goes up Public.
export async function uploadVideo(args: { filePath: string; title: string; description: string; tags?: string[]; publishAt: string | null }) {
  const token = await accessToken();
  const data = new Uint8Array(await fs.readFile(args.filePath));

  const future = !!args.publishAt && Date.parse(args.publishAt) > Date.now() + 60_000;
  const status: Record<string, unknown> = {
    privacyStatus: args.publishAt && !future ? 'public' : 'private',
    selfDeclaredMadeForKids: false,
  };
  if (future) status.publishAt = new Date(args.publishAt!).toISOString();

  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(data.byteLength),
      'X-Upload-Content-Type': 'video/*',
    },
    body: JSON.stringify({
      snippet: {
        title: clean(args.title, 100) || 'Untitled clip',
        description: clean(args.description, 5000),
        ...(args.tags && args.tags.length ? { tags: args.tags } : {}),
        categoryId: '20', // Gaming
      },
      status,
    }),
  });
  if (!init.ok) throw new Error(await apiError(init));
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube did not return an upload address.');

  const up = await fetch(location, { method: 'PUT', headers: { 'Content-Type': 'video/*' }, body: data });
  if (!up.ok) throw new Error(await apiError(up));
  const video = (await up.json()) as { id?: string; status?: { privacyStatus?: string } };
  if (!video.id) throw new Error('YouTube did not return a video id.');
  return video.id;
}

export const youtubePublisher: Publisher = {
  isConnected: isYoutubeConnected,
  async publish({ post, clip, batch, filePath }) {
    const t = finalText(clip, batch);
    const id = await uploadVideo({
      filePath,
      title: t.title,
      description: t.description,
      tags: t.tags,
      publishAt: post.mode === 'schedule' ? post.publishAt : null,
    });
    return { externalId: id, url: `https://studio.youtube.com/video/${id}/edit` };
  },
};
