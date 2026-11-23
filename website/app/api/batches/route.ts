import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { aiReady } from '@/lib/ai';
import { isPlatform, startStatus } from '@/lib/platforms';
import { fmtWhen } from '@/lib/format';
import { emptyAi, newId, readDb, updateDb, type AiResult, type Batch, type Clip, type Mode, type Post } from '@/lib/store';

type InClip = {
  uploadId?: string; // video already uploaded on the Bulk upload page
  fileName?: string;
  size?: number;
  title?: string;
  description?: string;
  hashtags?: string[];
  tags?: string[];
  igCaption?: string;
  game?: string;
  publishAt?: string | null; // its own date & time (overrides start + gap)
};

type Body = {
  name?: string;
  caption?: string;
  mode?: Mode;
  platforms?: string[];
  startAt?: string | null;
  gapHours?: number;
  useAi?: boolean;
  clips?: InClip[];
};

const GAPS = [1, 2, 3, 6, 12, 24];

function titleFromName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const strList = (v: unknown, max: number) =>
  Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, max) : [];

// Create a batch: its clips, and one post per clip per platform.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return badRequest('Bad request.');

  const mode: Mode = body.mode === 'draft' ? 'draft' : 'schedule';
  const platforms = Array.from(new Set(body.platforms || [])).filter(isPlatform);
  const input = (body.clips || []).filter((c) => c && (c.uploadId || typeof c.fileName === 'string')).slice(0, 100);
  if (platforms.length === 0) return badRequest('Pick at least one platform.');
  if (input.length === 0) return badRequest('Add at least one clip.');

  const gap = GAPS.includes(Number(body.gapHours)) ? Number(body.gapHours) : 3;
  let start: number | null = null;
  if (mode === 'schedule') {
    start = Date.parse(body.startAt || '');
    if (isNaN(start)) return badRequest('Pick a time for the first post.');
    if (start < Date.now() - 60_000) return badRequest('The first post time is in the past.');
  }

  // A clip can carry its own date & time; otherwise start + i × gap.
  const ownTimes: (number | null)[] = input.map((c) => {
    if (mode !== 'schedule' || !c.publishAt) return null;
    const t = Date.parse(c.publishAt);
    return isNaN(t) ? null : t;
  });
  if (ownTimes.some((t) => t !== null && t < Date.now() - 60_000)) return badRequest('One of the clip times is in the past.');

  const db = await readDb();
  const uploads = new Map(db.uploads.map((u) => [u.id, u]));
  for (const c of input) {
    if (c.uploadId && !uploads.get(c.uploadId)?.storedAs) return badRequest('A video is still uploading. Wait for it to finish.');
  }

  const useAiLater = body.useAi === true && aiReady(db);
  const now = new Date().toISOString();
  const batch: Batch = {
    id: newId(),
    name: (body.name || '').trim().slice(0, 80) || `Batch · ${fmtWhen(now)}`,
    caption: (body.caption || '').slice(0, 2200),
    mode,
    platforms,
    startAt: start !== null ? new Date(start).toISOString() : null,
    gapHours: gap,
    useAi: useAiLater,
    createdAt: now,
  };

  const clips: Clip[] = input.map((c, i) => {
    const up = c.uploadId ? uploads.get(c.uploadId) : undefined;
    const fileName = String(up?.fileName || c.fileName || 'clip.mp4').slice(0, 200);
    const typed = String(c.title || '').trim().slice(0, 100);
    const description = String(c.description || '').trim().slice(0, 4000);
    const hashtags = strList(c.hashtags, 30);
    const hasText = !!(typed || description || hashtags.length);

    // Text written (and possibly edited by you) on the upload page is final.
    let ai: AiResult;
    if (up && hasText) {
      ai = {
        ...emptyAi('done'),
        title: typed || null,
        titleOptions: up.ai?.titleOptions,
        description: description || null,
        hashtags,
        tags: strList(c.tags, 20),
        igCaption: String(c.igCaption || '').trim().slice(0, 2200) || null,
        game: String(c.game || up.ai?.game || '').slice(0, 60) || null,
        viralScore: up.ai?.viralScore ?? null,
        scoreReason: up.ai?.scoreReason ?? null,
        updatedAt: now,
      };
    } else {
      ai = emptyAi(useAiLater ? 'pending' : 'off');
    }

    return {
      id: newId(),
      batchId: batch.id,
      index: i,
      fileName,
      size: up?.size || Number(c.size) || 0,
      title: (typed || titleFromName(fileName) || fileName).slice(0, 100),
      titleEdited: !!typed,
      storedAs: up?.storedAs ?? null,
      ai,
      createdAt: now,
    };
  });

  const posts: Post[] = clips.flatMap((c, i) =>
    platforms.map((platform) => ({
      id: newId(),
      batchId: batch.id,
      clipId: c.id,
      platform,
      mode,
      publishAt: ownTimes[i] !== null ? new Date(ownTimes[i]!).toISOString() : start !== null ? new Date(start + i * gap * 3600_000).toISOString() : null,
      status: c.storedAs ? startStatus(platform, mode) : ('waiting_file' as const),
      error: null,
      externalId: null,
      attempts: 0,
      updatedAt: now,
    }))
  );

  const usedUploads = new Set(input.map((c) => c.uploadId).filter(Boolean));
  await updateDb((d) => {
    d.batches.push(batch);
    d.clips.push(...clips);
    d.posts.push(...posts);
    d.uploads = d.uploads.filter((u) => !usedUploads.has(u.id));
  });

  return NextResponse.json({ ok: true, batchId: batch.id, clips: clips.map((c) => ({ id: c.id, fileName: c.fileName })) });
}
