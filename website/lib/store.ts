// Local data store: one JSON file at data/nova.json, video files in storage/clips/.
// Kept behind these few functions so it can be swapped for Postgres later
// without touching the pages.
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { PLATFORM_IDS, type Platform } from './platforms';
export type { Platform };
export type Mode = 'draft' | 'schedule';
export type PostStatus =
  | 'waiting_file' // batch created, video not uploaded to Nova yet
  | 'queued' // ready for the worker
  | 'held' // Instagram "draft": stays in the Nova queue, never auto-posts
  | 'needs_connection' // platform not connected yet; retried once it is
  | 'working' // worker is sending it now
  | 'done'
  | 'failed';

export type Batch = {
  id: string;
  name: string;
  caption: string;
  mode: Mode;
  platforms: Platform[];
  startAt: string | null;
  gapHours: number;
  useAi?: boolean;
  createdAt: string;
};

// What the AI wrote for one clip.
export type AiResult = {
  status: 'off' | 'pending' | 'working' | 'done' | 'failed';
  title: string | null;
  titleOptions?: string[];
  viralScore?: number | null; // 1–100, the AI's guess at how well it will do
  scoreReason?: string | null;
  description: string | null;
  hashtags: string[];
  tags: string[];
  igCaption: string | null;
  game: string | null;
  error: string | null;
  updatedAt: string | null;
};

export type Clip = {
  id: string;
  batchId: string;
  index: number;
  fileName: string;
  size: number;
  title: string;
  titleEdited?: boolean; // you typed your own title, so the AI title isn't used
  storedAs: string | null;
  ai?: AiResult;
  createdAt: string;
};

// Autopilot: videos dropped into the inbox folder are handled with no clicks.
export type Autopilot = {
  enabled: boolean;
  platforms: Platform[];
  mode: Mode;
  gapHours: number;
  caption: string;
};

export type Prefs = {
  deleteAfterPost: boolean; // remove Nova's copy of a video once every post of it is done
  publicUrl: string | null; // public https address of this site (Instagram downloads videos from it)
  linkKey?: string | null; // lets the Nova Studio clipping tool send clips here (x-nova-key header)
  studioUrl?: string | null; // where the Nova Studio clipping tool runs (shown inside the Studio page)
  studioSeenAt?: string | null; // last time the Studio synced with this site
  watermark?: string | null; // the Studio's watermark text, kept in step
};

// A video uploaded on the Upload page, before it's part of a batch.
export type Upload = {
  id: string;
  fileName: string;
  size: number;
  storedAs: string | null;
  ai: AiResult | null;
  createdAt: string;
};

export function emptyAi(status: AiResult['status']): AiResult {
  return { status, title: null, description: null, hashtags: [], tags: [], igCaption: null, game: null, error: null, updatedAt: null };
}

export type Post = {
  id: string;
  batchId: string;
  clipId: string;
  platform: Platform;
  mode: Mode;
  publishAt: string | null;
  status: PostStatus;
  error: string | null;
  externalId: string | null;
  externalUrl?: string | null; // link to the post on the platform
  attempts: number;
  updatedAt: string;
};

export type Connection = { connected: boolean; account: string | null; updatedAt: string | null };

// Server-only. Never send this part to the browser.
export type YoutubeSecrets = {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  channelId: string | null;
};

export type Db = {
  version: 1;
  batches: Batch[];
  clips: Clip[];
  posts: Post[];
  uploads: Upload[];
  autopilot: Autopilot;
  prefs: Prefs;
  connections: Record<Platform, Connection>;
  secrets: {
    youtube: YoutubeSecrets;
    instagram: { token: string | null; userId: string | null; savedAt: number | null; expiresAt: number | null };
    gemini: { apiKey: string | null; model: string | null; updatedAt?: string | null };
  };
};

export const DATA_DIR = path.join(process.cwd(), 'data');
export const STORAGE_DIR = path.join(process.cwd(), 'storage', 'clips');
// Autopilot watches this folder. Point your clipping tool's output here.
export const INBOX_DIR = process.env.NOVA_INBOX_DIR || path.join(process.cwd(), 'inbox');
const FILE = path.join(DATA_DIR, 'nova.json');

function empty(): Db {
  const off: Connection = { connected: false, account: null, updatedAt: null };
  return {
    version: 1,
    batches: [],
    clips: [],
    posts: [],
    uploads: [],
    autopilot: { enabled: false, platforms: ['youtube'], mode: 'schedule', gapHours: 3, caption: '' },
    prefs: { deleteAfterPost: false, publicUrl: null },
    connections: Object.fromEntries(PLATFORM_IDS.map((id) => [id, { ...off }])) as Record<Platform, Connection>,
    secrets: {
      youtube: { clientId: null, clientSecret: null, refreshToken: null, accessToken: null, expiresAt: null, channelId: null },
      instagram: { token: null, userId: null, savedAt: null, expiresAt: null },
      gemini: { apiKey: null, model: null },
    },
  };
}

export const newId = () => randomUUID().replace(/-/g, '').slice(0, 16);

// One lock for the whole process (shared across Next's bundles via globalThis),
// so writes never overlap.
type G = { __novaLock?: Promise<unknown> };
const g = globalThis as unknown as G;

async function load(): Promise<Db> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const db = JSON.parse(raw) as Partial<Db>;
    const base = empty();
    return {
      ...base,
      ...db,
      version: 1,
      connections: { ...base.connections, ...(db.connections || {}) },
      autopilot: { ...base.autopilot, ...(db.autopilot || {}) },
      prefs: { ...base.prefs, ...(db.prefs || {}) },
      secrets: {
        youtube: { ...base.secrets.youtube, ...(db.secrets?.youtube || {}) },
        instagram: { ...base.secrets.instagram, ...(db.secrets?.instagram || {}) },
        gemini: { ...base.secrets.gemini, ...(db.secrets?.gemini || {}) },
      },
    } as Db;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return empty();
    throw e;
  }
}

async function save(db: Db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const text = JSON.stringify(db, null, 2);
  const tmp = FILE + '.tmp';
  await fs.writeFile(tmp, text, 'utf8');
  try {
    await fs.rename(tmp, FILE);
  } catch {
    // Windows can refuse the swap if something has the file open; write directly instead.
    await fs.writeFile(FILE, text, 'utf8');
  }
}

// Keys never leave the engine: a copy for pages shows only whether each one is set.
export function withoutSecrets(db: Db): Db {
  const mark = (v: unknown) => (v ? 'set' : null);
  const y = db.secrets.youtube;
  const i = db.secrets.instagram;
  const gm = db.secrets.gemini;
  return {
    ...db,
    prefs: { ...db.prefs, linkKey: db.prefs.linkKey ? 'set' : null },
    secrets: {
      youtube: { ...y, clientSecret: mark(y.clientSecret), refreshToken: mark(y.refreshToken), accessToken: mark(y.accessToken) },
      instagram: { ...i, token: mark(i.token) },
      gemini: { ...gm, apiKey: mark(gm.apiKey) },
    },
  } as Db;
}

async function fromEngine(): Promise<Db> {
  const { ENGINE_SECRET, ENGINE_URL } = await import('./role');
  const r = await fetch(`${ENGINE_URL}/api/engine/db`, { headers: { 'x-engine-key': ENGINE_SECRET }, cache: 'no-store' });
  if (!r.ok) throw new Error(`The Nova Clipping engine answered ${r.status}`);
  return (await r.json()) as Db;
}

export async function readDb(): Promise<Db> {
  if (process.env.NOVA_ROLE === 'web') return fromEngine();
  await (g.__novaLock ?? Promise.resolve()).catch(() => {});
  return load();
}

export function updateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  if (process.env.NOVA_ROLE === 'web') return Promise.reject(new Error('The website copy on Netlify keeps no data; this runs on the engine.'));
  const run = (g.__novaLock ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const db = await load();
      const out = await fn(db);
      await save(db);
      return out;
    });
  g.__novaLock = run.catch(() => {});
  return run;
}
