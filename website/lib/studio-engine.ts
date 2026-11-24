// Nova Studio on the engine (VM): runs clipping projects on the clipping
// engine (the Studio backend, http://backend:8000), brings finished clips into
// the library, makes small preview copies, and applies the automation rules.
// Called from the worker every 20 seconds. Engine only.
import { spawn } from 'child_process';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { nextSlot } from './worker';
import { publishers } from './publishers';
import { startStatus, type Platform } from './platforms';
import { sendMail } from './mail';
import { APP_URL } from './role';
import {
  STORAGE_DIR,
  emptyAi,
  newId,
  readDb,
  updateDb,
  type Batch,
  type Clip,
  type Db,
  type LibStatus,
  type LibraryClip,
  type Post,
  type StudioJob,
} from './store';

export const STUDIO_API = (process.env.STUDIO_API_URL || 'http://backend:8000').replace(/\/+$/, '');
export const STUDIO_OUTPUT = process.env.STUDIO_OUTPUT || '/studio-output';
export const PREVIEW_DIR = path.join(process.cwd(), 'storage', 'previews');
const DAY = 86_400_000;

// ---------- viral score -------------------------------------------------------

/** The score a clip would get if posted now: a trending moment cools off day by day. */
export function currentScore(c: Pick<LibraryClip, 'viralScore' | 'createdAt' | 'status' | 'postedAt'>) {
  const until = c.postedAt ? Date.parse(c.postedAt) : Date.now();
  const days = Math.max(0, (until - Date.parse(c.createdAt)) / DAY);
  return Math.max(0, Math.round(c.viralScore * Math.pow(0.96, days)));
}

export function statusForScore(score: number, autoPost: boolean): LibStatus | 'auto' {
  if (score >= 90) return autoPost ? 'auto' : 'confirm';
  if (score >= 70) return 'confirm';
  if (score >= 50) return 'approval';
  return 'on_hold';
}

// ---------- progress -----------------------------------------------------------

function progressFromLogs(logs: string[], status: string, targetClips: number): { progress: number; stage: string } {
  if (status === 'queued') return { progress: 2, stage: 'Waiting for the clipping engine' };
  const text = logs.join('\n');
  const rendered = (text.match(/Processing clip:/g) || []).length;
  if (rendered > 0) {
    const of = Math.max(targetClips, rendered + 1);
    return { progress: Math.min(97, 55 + Math.round((rendered / of) * 42)), stage: `Making clip ${rendered} of about ${of}` };
  }
  if (/viral|moments|Gemini|Analy[sz]/i.test(text)) return { progress: 45, stage: 'Finding the best moments' };
  if (/Transcrib/i.test(text)) return { progress: 30, stage: 'Listening to the video' };
  if (/Download/i.test(text)) return { progress: 12, stage: 'Downloading the video' };
  return { progress: 6, stage: 'Starting' };
}

// ---------- talking to the clipping engine ---------------------------------------

async function studioFetch(p: string, init: RequestInit & { duplex?: 'half' } = {}, gemini?: string | null) {
  const headers = new Headers(init.headers);
  if (gemini) headers.set('X-Gemini-Key', gemini);
  const r = await fetch(`${STUDIO_API}${p}`, { ...init, headers, cache: 'no-store' });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = (await r.json()) as { detail?: unknown };
      if (typeof j.detail === 'string') msg = j.detail;
    } catch {}
    throw new Error(msg);
  }
  return r;
}

async function sendFile(filePath: string, fileName: string, gemini: string): Promise<string> {
  const slot = (await (await studioFetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: fileName }),
  }, gemini)).json()) as { upload_id: string };
  const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  await studioFetch(`/api/uploads/${slot.upload_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body,
    duplex: 'half',
  }, gemini);
  return slot.upload_id;
}

async function startJob(db: Db, job: StudioJob): Promise<string> {
  const gemini = db.secrets.gemini.apiKey;
  if (!gemini) throw new Error('Add your Gemini key in Settings first.');
  const payload: Record<string, unknown> = { acknowledged: true };
  if (job.source.kind === 'url') {
    payload.url = job.source.url;
  } else {
    const up = db.uploads.find((u) => u.id === (job.source as { uploadId: string }).uploadId);
    if (!up?.storedAs) throw new Error('The uploaded video is missing. Upload it again.');
    payload.upload_id = await sendFile(path.join(STORAGE_DIR, up.storedAs), up.fileName, gemini);
  }
  const r = (await (await studioFetch('/api/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, gemini)).json()) as { job_id: string };
  return r.job_id;
}

type StudioStatus = {
  status: string;
  logs?: string[];
  result?: { clips?: { video_url?: string }[] } | null;
};

// ---------- library ----------------------------------------------------------------

type Short = {
  predicted_score?: number;
  video_title_for_youtube_short?: string;
  video_description_for_instagram?: string;
  video_description_for_tiktok?: string;
  start?: number;
  end?: number;
};

const tagsIn = (s: string) => Array.from(new Set((s.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()))).slice(0, 15);
const stripTags = (s: string) => s.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();

async function importClips(job: StudioJob, st: StudioStatus): Promise<Omit<LibraryClip, 'status' | 'statusAt'>[]> {
  const dir = path.join(STUDIO_OUTPUT, job.studioJobId!);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const metaName = names.find((n) => n.endsWith('_metadata.json'));
  const meta = metaName ? (JSON.parse(await fs.readFile(path.join(dir, metaName), 'utf8')) as { shorts?: Short[] }) : {};
  const shorts = meta.shorts || [];
  const base = metaName ? metaName.replace(/_metadata\.json$/, '') : '';
  const urls = st.result?.clips || [];
  const now = new Date().toISOString();
  const out: Omit<LibraryClip, 'status' | 'statusAt'>[] = [];
  const count = Math.max(shorts.length, urls.length);
  for (let i = 0; i < count; i++) {
    const fromUrl = urls[i]?.video_url ? decodeURIComponent(urls[i].video_url!.split('?')[0].split('/').pop() || '') : '';
    const name = fromUrl && names.includes(fromUrl) ? fromUrl : `${base}_clip_${i + 1}.mp4`;
    const file = path.join(dir, name);
    const st2 = await fs.stat(file).catch(() => null);
    if (!st2) continue;
    const s = shorts[i] || {};
    const desc = s.video_description_for_instagram || s.video_description_for_tiktok || '';
    out.push({
      id: newId(),
      projectId: job.projectId,
      jobId: job.id,
      studioJobId: job.studioJobId!,
      index: i,
      title: (s.video_title_for_youtube_short || `Clip ${i + 1}`).slice(0, 100),
      description: stripTags(desc).slice(0, 2000),
      hashtags: tagsIn(desc),
      file,
      preview: null,
      size: st2.size,
      duration: s.start != null && s.end != null ? Math.round((s.end - s.start) * 10) / 10 : null,
      viralScore: Math.max(0, Math.min(100, Math.round(Number(s.predicted_score) || 0))),
      createdAt: now,
      scheduledFor: null,
      postedAt: null,
      postedTo: [],
      postClipId: null,
      autoPosted: false,
    });
  }
  return out;
}

/** Put a library clip into the posting queue (YouTube / Instagram). Returns the time. */
export function scheduleClip(db: Db, lib: LibraryClip, platforms: Platform[], at?: number | null): string | null {
  const usable = platforms.filter((p) => publishers[p].isConnected(db));
  if (!usable.length || !lib.file) return null;
  const when = at ?? nextSlot(db, db.studio.gapHours);
  const now = new Date().toISOString();
  const project = db.projects.find((p) => p.id === lib.projectId);
  const batch: Batch = {
    id: newId(),
    name: `${project?.name || 'Studio'} · ${lib.title}`.slice(0, 80),
    caption: '',
    mode: 'schedule',
    platforms: usable,
    startAt: new Date(when).toISOString(),
    gapHours: db.studio.gapHours,
    useAi: false,
    createdAt: now,
  };
  const clip: Clip = {
    id: newId(),
    batchId: batch.id,
    index: 0,
    fileName: path.basename(lib.file),
    size: lib.size,
    title: lib.title,
    titleEdited: true,
    storedAs: null,
    filePath: lib.file,
    libraryId: lib.id,
    ai: { ...emptyAi('done'), title: lib.title, description: lib.description || null, hashtags: lib.hashtags, viralScore: lib.viralScore, updatedAt: now },
    createdAt: now,
  };
  const posts: Post[] = usable.map((platform) => ({
    id: newId(),
    batchId: batch.id,
    clipId: clip.id,
    platform,
    mode: 'schedule',
    publishAt: new Date(when).toISOString(),
    status: startStatus(platform, 'schedule'),
    error: null,
    externalId: null,
    attempts: 0,
    updatedAt: now,
  }));
  db.batches.unshift(batch);
  db.clips.push(clip);
  db.posts.push(...posts);
  lib.status = 'scheduled';
  lib.statusAt = now;
  lib.scheduledFor = batch.startAt;
  lib.postClipId = clip.id;
  return batch.startAt;
}

// ---------- previews -----------------------------------------------------------------

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function makeOnePreview() {
  const db = await readDb();
  const c = db.library.find((x) => x.file && !x.preview && x.status !== 'deleted');
  if (!c) return;
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const out = path.join(PREVIEW_DIR, `${c.id}.mp4`);
  try {
    await ffmpeg(['-y', '-i', c.file!, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32',
      '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out]);
  } catch {
    await fs.unlink(out).catch(() => {});
    // Fall back to the original so the card still plays.
    await updateDb((d) => { const x = d.library.find((y) => y.id === c.id); if (x) x.preview = x.file; });
    return;
  }
  await updateDb((d) => { const x = d.library.find((y) => y.id === c.id); if (x) x.preview = out; });
}

// ---------- storage --------------------------------------------------------------------

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) total += await dirSize(p);
    else total += (await fs.stat(p).catch(() => null))?.size || 0;
  }
  return total;
}

type G = { __novaStorage?: { at: number; usedBytes: number; diskFree: number; diskTotal: number } };
const g = globalThis as unknown as G;

/** Space used by Nova (clips, previews, uploads) and the disk, measured at most every 5 minutes. */
export async function storage(force = false) {
  if (!force && g.__novaStorage && Date.now() - g.__novaStorage.at < 300_000) return g.__novaStorage;
  const usedBytes = (await dirSize(STUDIO_OUTPUT)) + (await dirSize(path.join(process.cwd(), 'storage')));
  const st = await fs.statfs(STUDIO_OUTPUT).catch(() => null);
  g.__novaStorage = {
    at: Date.now(),
    usedBytes,
    diskFree: st ? st.bavail * st.bsize : 0,
    diskTotal: st ? st.blocks * st.bsize : 0,
  };
  return g.__novaStorage;
}

// ---------- the worker step ------------------------------------------------------------

async function mailSafe(subject: string, text: string) {
  try { await sendMail({ subject, text }); } catch (e) { console.error('[nova-mail]', e); }
}

export async function runStudio() {
  // 1) Storage limit
  const s = await storage();
  const pre = await readDb();
  const limit = pre.studio.storageLimitGb * 1024 ** 3;
  const full = s.usedBytes >= limit || (s.diskTotal > 0 && s.diskFree < 2 * 1024 ** 3);
  if (full !== pre.studio.storageFull) await updateDb((d) => { d.studio.storageFull = full; });
  if (full && (!pre.studio.lastStorageMailAt || Date.now() - Date.parse(pre.studio.lastStorageMailAt) > DAY)) {
    await updateDb((d) => { d.studio.lastStorageMailAt = new Date().toISOString(); });
    await mailSafe('Nova Clipping storage is full',
      `Nova Clipping is using ${(s.usedBytes / 1024 ** 3).toFixed(1)} GB of your ${pre.studio.storageLimitGb} GB limit.\n\n` +
      `New clipping projects wait until you free some space. Delete old clips here: ${APP_URL || ''}/studio\n`);
  }

  // 2) Start waiting jobs when there is room
  const db = await readDb();
  const running = db.jobs.filter((j) => j.status === 'sending' || j.status === 'clipping').length;
  const waiting = db.jobs.filter((j) => j.status === 'waiting').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!full && running < db.studio.maxParallel && waiting.length) {
    const job = waiting[0];
    await updateDb((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) { j.status = 'sending'; j.stage = 'Sending the video to the clipping engine'; j.progress = 3; j.startedAt = new Date().toISOString(); } });
    try {
      const id = await startJob(await readDb(), job);
      await updateDb((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) { j.studioJobId = id; j.status = 'clipping'; j.progress = 5; j.stage = 'Starting'; } });
      // The engine has its own copy now; free the uploaded file.
      if (job.source.kind === 'file') {
        const upId = job.source.uploadId;
        const file = await updateDb((d) => {
          const u = d.uploads.find((x) => x.id === upId);
          const f = u?.storedAs || null;
          d.uploads = d.uploads.filter((x) => x.id !== upId);
          return f;
        });
        if (file) await fs.unlink(path.join(STORAGE_DIR, file)).catch(() => {});
      }
    } catch (e) {
      await updateDb((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) { j.status = 'failed'; j.error = e instanceof Error ? e.message : String(e); j.finishedAt = new Date().toISOString(); } });
    }
  }

  // 3) Follow running jobs
  for (const job of (await readDb()).jobs.filter((j) => j.status === 'clipping' && j.studioJobId)) {
    let st: StudioStatus;
    try {
      st = (await (await studioFetch(`/api/status/${job.studioJobId}`)).json()) as StudioStatus;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not found/i.test(msg)) await updateDb((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) { j.status = 'failed'; j.error = 'The clipping engine lost this job (it restarted). Start it again.'; } });
      continue;
    }
    if (st.status === 'failed') {
      const last = (st.logs || []).slice(-1)[0] || 'Clipping failed.';
      await updateDb((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) { j.status = 'failed'; j.error = friendlyError(st.logs || [], last); j.finishedAt = new Date().toISOString(); } });
      continue;
    }
    if (st.status !== 'completed') {
      const p = progressFromLogs(st.logs || [], st.status, 6);
      if (p.progress !== job.progress || p.stage !== job.stage) {
        await updateDb((d) => { const j = d.jobs.find((x) => x.id === job.id); if (j) { j.progress = Math.max(j.progress, p.progress); j.stage = p.stage; } });
      }
      continue;
    }
    // Finished: bring the clips in and apply the rules.
    const clips = await importClips(job, st);
    const auto: LibraryClip[] = [];
    const confirm: LibraryClip[] = [];
    await updateDb((d) => {
      const now = new Date().toISOString();
      for (const c of clips) {
        const rule = statusForScore(c.viralScore, d.studio.autoPost);
        const lib: LibraryClip = { ...c, status: rule === 'auto' ? 'ready' : rule, statusAt: now };
        d.library.push(lib);
        if (rule === 'auto') {
          if (scheduleClip(d, lib, d.studio.platforms)) { lib.autoPosted = true; auto.push(lib); }
          else { lib.status = 'confirm'; confirm.push(lib); }
        } else if (rule === 'confirm') confirm.push(lib);
      }
      const j = d.jobs.find((x) => x.id === job.id);
      if (j) { j.status = 'done'; j.progress = 100; j.stage = null; j.clipCount = clips.length; j.finishedAt = now; }
    });
    const project = (await readDb()).projects.find((p) => p.id === job.projectId)?.name || 'your project';
    for (const c of auto) {
      await mailSafe(`Posted automatically: ${c.title}`,
        `"${c.title}" scored ${c.viralScore}/100, so Nova Clipping scheduled it right away (${project}).\n` +
        `Goes out: ${c.scheduledFor ? new Date(c.scheduledFor).toUTCString() : 'soon'}\n\n${APP_URL || ''}/studio\n`);
    }
    if (confirm.length) {
      await mailSafe(`${confirm.length} clip${confirm.length > 1 ? 's' : ''} ready to post — confirm?`,
        confirm.map((c) => `• ${c.title} — viral ${c.viralScore}/100`).join('\n') +
        `\n\nOpen Nova Clipping to post them with one tap: ${APP_URL || ''}/studio\n`);
    }
  }

  // 4) Previews (one per tick, so clipping keeps the CPU)
  await makeOnePreview().catch((e) => console.error('[nova-preview]', e));

  // 5) Time rules
  const removeFiles: string[] = [];
  await updateDb((d) => {
    const now = Date.now();
    const iso = new Date().toISOString();
    for (const c of d.library) {
      // Scheduled clips become "posted" once every post of them is done.
      if (c.status === 'scheduled' && c.postClipId) {
        const posts = d.posts.filter((p) => p.clipId === c.postClipId);
        if (posts.length && posts.every((p) => p.status === 'done')) {
          c.status = 'posted';
          c.statusAt = iso;
          c.postedAt = iso;
          c.postedTo = Array.from(new Set(posts.map((p) => p.platform)));
        }
      }
      // Not posted within 7 days: on hold (kept, never auto-deleted).
      if ((c.status === 'confirm' || c.status === 'approval' || c.status === 'ready') && now - Date.parse(c.createdAt) > 7 * DAY) {
        c.status = 'on_hold';
        c.statusAt = iso;
      }
      // Posted more than 7 days ago: delete the files, keep the record.
      if (c.status === 'posted' && c.postedAt && now - Date.parse(c.postedAt) > 7 * DAY) {
        if (c.file) removeFiles.push(c.file);
        if (c.preview && c.preview !== c.file) removeFiles.push(c.preview);
        c.file = null;
        c.preview = null;
        c.status = 'deleted';
        c.statusAt = iso;
      }
    }
  });
  for (const f of removeFiles) await fs.unlink(f).catch(() => {});
}

/** Delete a clip's files now and keep its record. */
export async function deleteClipFiles(ids: string[]) {
  const files: string[] = [];
  await updateDb((d) => {
    const iso = new Date().toISOString();
    for (const c of d.library) {
      if (!ids.includes(c.id) || c.status === 'deleted') continue;
      if (c.status === 'scheduled') continue; // protected until it goes out
      if (c.file) files.push(c.file);
      if (c.preview && c.preview !== c.file) files.push(c.preview);
      c.file = null;
      c.preview = null;
      c.status = 'deleted';
      c.statusAt = iso;
    }
  });
  for (const f of files) await fs.unlink(f).catch(() => {});
  g.__novaStorage = undefined;
}

// Turn the engine's last log lines into a message the Studio can show.
function friendlyError(logs: string[], last: string): string {
  const text = logs.slice(-60).join('\n');
  if (/confirm you.?re not a bot|LOGIN_REQUIRED|cookies/i.test(text) && /youtube/i.test(text))
    return 'YouTube blocked the VM (“confirm you’re not a bot”). Add YouTube cookies in Settings → YouTube links, or upload the video file instead.';
  if (/Private video|Video unavailable|This video is unavailable/i.test(text)) return 'That video is private or unavailable.';
  if (/too short|no usable clips/i.test(text)) return 'The video is too short or had no usable moments for clips.';
  return last.replace(/^[^\w]+/, '').slice(0, 300);
}
