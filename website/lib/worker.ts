// Background worker. Starts with the site (see instrumentation.ts) and checks
// the queue every 20 seconds:
//   1. AI writes title/description/hashtags for new clips (if turned on)
//   2. sends posts that are due to YouTube / Instagram
import { promises as fs } from 'fs';
import path from 'path';
import {
  INBOX_DIR,
  STORAGE_DIR,
  emptyAi,
  newId,
  readDb,
  updateDb,
  type AiResult,
  type Batch,
  type Clip,
  type Db,
  type Post,
} from './store';
import { publishers } from './publishers';
import { aiReady, analyzeClip, type AiOutput } from './ai';
import { fmtWhen } from './format';
import { platformMeta, startStatus } from './platforms';

const TICK_MS = 20_000;
const MAX_ATTEMPTS = 3;
const VIDEO = /\.(mp4|mov|webm|mkv|m4v)$/i;
// Bump when the worker changes, so a running dev server switches to the new code.
const WORKER_VERSION = 5;

// First free time slot: after the last scheduled post (plus the gap), and at least ~30 min from now, on the hour.
export function nextSlot(db: Db, gapHours: number) {
  const now = Date.now();
  const soonest = Math.ceil((now + 30 * 60_000) / 3600_000) * 3600_000;
  const future = db.posts
    .filter((p) => p.mode === 'schedule' && p.publishAt && p.status !== 'failed')
    .map((p) => Date.parse(p.publishAt!))
    .filter((t) => t > now);
  const last = future.length ? Math.max(...future) : 0;
  return Math.max(soonest, last ? last + gapHours * 3600_000 : 0);
}

// Step 0: Autopilot. New videos in the inbox folder are copied in, written up by the AI,
// ranked by AI score, and scheduled best-first into the next free slots.
async function runInbox() {
  const db = await readDb();
  if (!db.autopilot.enabled) return;
  await fs.mkdir(path.join(INBOX_DIR, 'done'), { recursive: true });

  const entries = await fs.readdir(INBOX_DIR, { withFileTypes: true });
  const ready: { name: string; size: number }[] = [];
  for (const e of entries) {
    if (!e.isFile() || !VIDEO.test(e.name)) continue;
    const st = await fs.stat(path.join(INBOX_DIR, e.name));
    // Skip files still being copied in.
    if (Date.now() - st.mtimeMs < 20_000 || st.size === 0) continue;
    ready.push({ name: e.name, size: st.size });
  }
  if (!ready.length) return;

  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const prepared: { id: string; fileName: string; size: number; storedAs: string; ai: AiOutput | null; aiError: string | null }[] = [];
  for (const f of ready.slice(0, 20)) {
    const id = newId();
    const storedAs = `${id}${path.extname(f.name).toLowerCase()}`;
    const src = path.join(INBOX_DIR, f.name);
    await fs.copyFile(src, path.join(STORAGE_DIR, storedAs));
    // Keep your original, moved out of the way so it isn't picked up twice.
    await fs.rename(src, path.join(INBOX_DIR, 'done', `${Date.now()}-${f.name}`)).catch(async () => {
      await fs.unlink(src).catch(() => {});
    });

    let ai: AiOutput | null = null;
    let aiError: string | null = null;
    const fresh = await readDb();
    if (aiReady(fresh)) {
      try {
        ai = await analyzeClip(fresh, {
          filePath: path.join(STORAGE_DIR, storedAs),
          fileName: f.name,
          channel: fresh.connections.youtube.account || '@theclipdose.official',
        });
      } catch (e) {
        aiError = e instanceof Error ? e.message : String(e);
      }
    }
    prepared.push({ id, fileName: f.name, size: f.size, storedAs, ai, aiError });
  }

  // Best clips first.
  prepared.sort((a, b) => (b.ai?.viralScore ?? 0) - (a.ai?.viralScore ?? 0));

  await updateDb((d) => {
    const ap = d.autopilot;
    const now = new Date().toISOString();
    const start = ap.mode === 'schedule' ? nextSlot(d, ap.gapHours) : null;
    const batch: Batch = {
      id: newId(),
      name: `Autopilot · ${fmtWhen(now)}`,
      caption: ap.caption,
      mode: ap.mode,
      platforms: ap.platforms.length ? ap.platforms : ['youtube'],
      startAt: start !== null ? new Date(start).toISOString() : null,
      gapHours: ap.gapHours,
      useAi: true,
      createdAt: now,
    };
    const clips: Clip[] = prepared.map((p, i) => ({
      id: p.id,
      batchId: batch.id,
      index: i,
      fileName: p.fileName,
      size: p.size,
      title: p.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 100),
      titleEdited: false,
      storedAs: p.storedAs,
      ai: p.ai
        ? { ...emptyAi('done'), ...p.ai, updatedAt: now }
        : { ...emptyAi(p.aiError ? 'failed' : 'off'), error: p.aiError, updatedAt: now },
      createdAt: now,
    }));
    const posts: Post[] = clips.flatMap((c, i) =>
      batch.platforms.map((platform) => ({
        id: newId(),
        batchId: batch.id,
        clipId: c.id,
        platform,
        mode: batch.mode,
        publishAt: start !== null ? new Date(start + i * batch.gapHours * 3600_000).toISOString() : null,
        status: startStatus(platform, batch.mode),
        error: null,
        externalId: null,
        attempts: 0,
        updatedAt: now,
      }))
    );
    d.batches.push(batch);
    d.clips.push(...clips);
    d.posts.push(...posts);
  });
}

// Once every post of a clip is done, remove Nova's copy (if turned on in Settings).
async function cleanup(clipId: string) {
  const file = await updateDb((d) => {
    if (!d.prefs.deleteAfterPost) return null;
    const c = d.clips.find((x) => x.id === clipId);
    if (!c?.storedAs) return null;
    const posts = d.posts.filter((p) => p.clipId === clipId);
    if (!posts.length || !posts.every((p) => p.status === 'done')) return null;
    const f = c.storedAs;
    c.storedAs = null;
    return f;
  });
  if (file) await fs.unlink(path.join(STORAGE_DIR, file)).catch(() => {});
}

type Info = { startedAt: string | null; lastTickAt: string | null; lastError: string | null; ticks: number };
type G = {
  __novaWorker?: ReturnType<typeof setInterval>;
  __novaWorkerVersion?: number;
  __novaTick?: () => Promise<void>;
  __novaTicking?: boolean;
  __novaInfo?: Info;
};
const g = globalThis as unknown as G;
const info = (): Info => (g.__novaInfo ??= { startedAt: null, lastTickAt: null, lastError: null, ticks: 0 });

export function workerStatus() {
  return { running: !!g.__novaWorker, version: g.__novaWorkerVersion ?? null, ...info() };
}

function isDue(p: Post, now: number) {
  if (p.status !== 'queued' && p.status !== 'needs_connection') return false;
  // Platforms that keep a publish time themselves (YouTube) get the upload right away.
  if (platformMeta[p.platform].nativeSchedule) return true;
  // Others (Instagram…): Nova posts when the slot arrives.
  return p.mode === 'schedule' && !!p.publishAt && Date.parse(p.publishAt) <= now;
}

async function setPost(id: string, patch: Partial<Post>) {
  await updateDb((db) => {
    const p = db.posts.find((x) => x.id === id);
    if (p) Object.assign(p, patch, { updatedAt: new Date().toISOString() });
  });
}

async function setAi(clipId: string, patch: Partial<AiResult>) {
  await updateDb((db) => {
    const c = db.clips.find((x) => x.id === clipId);
    if (c && c.ai) Object.assign(c.ai, patch, { updatedAt: new Date().toISOString() });
  });
}

// Step 1: AI for clips whose file has arrived.
async function runAi() {
  const db = await readDb();
  const todo = db.clips.filter((c) => c.storedAs && c.ai?.status === 'pending');
  for (const clip of todo) {
    await setAi(clip.id, { status: 'working', error: null });
    try {
      const fresh = await readDb();
      const out = await analyzeClip(fresh, {
        filePath: path.join(STORAGE_DIR, clip.storedAs!),
        fileName: clip.fileName,
        channel: fresh.connections.youtube.account || '@theclipdose.official',
      });
      await setAi(clip.id, { status: 'done', ...out, error: null });
    } catch (e) {
      // The clip still goes out, with your own title.
      await setAi(clip.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }
}

// Step 2: send what's due.
async function runPosts() {
  const now = Date.now();
  const db = await readDb();
  const due = db.posts.filter((p) => isDue(p, now));

  for (const p of due) {
    const fresh = await readDb();
    const current = fresh.posts.find((x) => x.id === p.id);
    if (!current || !isDue(current, now)) continue;

    const clip = fresh.clips.find((c) => c.id === current.clipId);
    // Wait for the AI to finish writing before sending.
    if (clip?.ai && (clip.ai.status === 'pending' || clip.ai.status === 'working')) continue;

    const publisher = publishers[current.platform];
    if (!publisher.isConnected(fresh)) {
      if (current.status !== 'needs_connection') await setPost(current.id, { status: 'needs_connection', error: null });
      continue;
    }

    const batch = fresh.batches.find((b) => b.id === current.batchId);
    if (!clip || !batch || !clip.storedAs) {
      await setPost(current.id, { status: 'failed', error: 'The clip file is missing.' });
      continue;
    }

    await setPost(current.id, { status: 'working', error: null });
    try {
      const result = await publisher.publish({
        post: current,
        clip,
        batch,
        filePath: path.join(STORAGE_DIR, clip.storedAs),
      });
      await setPost(current.id, { status: 'done', externalId: result.externalId, externalUrl: result.url ?? null, error: null });
      await cleanup(clip.id);
    } catch (e) {
      const attempts = current.attempts + 1;
      await setPost(current.id, {
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
        attempts,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export async function tick() {
  if (g.__novaTicking) return;
  g.__novaTicking = true;
  try {
    // An inbox problem must never stop scheduled posts from going out.
    await runInbox().catch((e) => {
      info().lastError = `Autopilot: ${e instanceof Error ? e.message : String(e)}`;
      console.error('[nova-worker] autopilot', e);
    });
    await runAi();
    await runPosts();
    if (!info().lastError?.startsWith('Autopilot')) info().lastError = null;
  } catch (e) {
    info().lastError = e instanceof Error ? e.message : String(e);
    console.error('[nova-worker]', e);
  } finally {
    info().lastTickAt = new Date().toISOString();
    info().ticks += 1;
    g.__novaTicking = false;
  }
}

// Always point the timer at the newest tick(), and replace an old-version timer.
g.__novaTick = tick;
if (g.__novaWorker && g.__novaWorkerVersion !== WORKER_VERSION) {
  clearInterval(g.__novaWorker);
  g.__novaWorker = undefined;
  g.__novaTicking = false;
}

export function startWorker() {
  if (g.__novaWorker) return;
  g.__novaWorkerVersion = WORKER_VERSION;
  g.__novaWorker = setInterval(() => void g.__novaTick?.(), TICK_MS);
  info().startedAt = new Date().toISOString();

  // Anything left mid-step by a restart goes back in the queue.
  void updateDb((db) => {
    for (const p of db.posts) if (p.status === 'working') p.status = 'queued';
    for (const c of db.clips) if (c.ai?.status === 'working') c.ai.status = 'pending';
  })
    .catch((e) => console.error('[nova-worker]', e))
    .then(() => setTimeout(() => void g.__novaTick?.(), 3000));

  console.log(`[nova-worker] v${WORKER_VERSION} started — checking the queue every 20s`);
}
