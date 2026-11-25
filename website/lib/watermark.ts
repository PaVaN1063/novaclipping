// Burns the channel watermark into finished clips on the VM, so every clip
// that can be posted already carries it. The clipping engine draws the text
// (Settings → watermark text on the engine); the result replaces the clip
// file and the clean copy is kept next to it as "<name>.nowm.mp4".
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
const STUDIO_API = (process.env.STUDIO_API_URL || 'http://backend:8000').replace(/\/+$/, '');
const STUDIO_OUTPUT = process.env.STUDIO_OUTPUT || '/studio-output';

export const CLEAN_SUFFIX = '.nowm.mp4';
const FAIL_SUFFIX = '.wmfail';
const MAX_TRIES = 3;

export function cleanCopy(file: string) {
  return file.replace(/\.mp4$/i, CLEAN_SUFFIX);
}

export async function isWatermarked(file: string) {
  return !!(await fs.stat(cleanCopy(file)).catch(() => null));
}

async function tries(file: string) {
  return Number((await fs.readFile(file + FAIL_SUFFIX, 'utf8').catch(() => '0')).split(':')[0]) || 0;
}

export async function gaveUp(file: string) {
  return (await tries(file)) >= MAX_TRIES;
}

export async function failReason(file: string) {
  const t = await fs.readFile(file + FAIL_SUFFIX, 'utf8').catch(() => '');
  return t.split(':').slice(1).join(':') || null;
}

/** Watermark one clip in place. Returns 'done', 'failed' or 'gave-up'. */
export async function burnWatermark(file: string): Promise<'done' | 'failed' | 'gave-up'> {
  if (await isWatermarked(file)) return 'done';
  if (await gaveUp(file)) return 'gave-up';
  const rel = path.relative(STUDIO_OUTPUT, file).split(path.sep);
  if (rel.length !== 2 || rel[0].startsWith('..')) return 'gave-up';
  const tmp = file + '.wm-tmp';
  try {
    const r = await fetch(`${STUDIO_API}/api/nova/watermark/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: `/videos/${rel[0]}/${encodeURIComponent(rel[1])}` }),
      signal: AbortSignal.timeout(20 * 60_000),
    });
    if (!r.ok || !r.body) {
      const j = (await r.json().catch(() => ({}))) as { detail?: string };
      throw new Error(j.detail || `engine answered ${r.status}`);
    }
    await pipeline(Readable.fromWeb(r.body as never), createWriteStream(tmp));
    const st = await fs.stat(tmp);
    if (st.size < 10_000) throw new Error('watermarked file came back empty');
    await fs.rename(file, cleanCopy(file));
    await fs.rename(tmp, file);
    await fs.unlink(file + FAIL_SUFFIX).catch(() => {});
    return 'done';
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    const n = (await tries(file)) + 1;
    const msg = e instanceof Error ? e.message : String(e);
    await fs.writeFile(file + FAIL_SUFFIX, `${n}:${msg.slice(0, 200)}`).catch(() => {});
    console.error('[nova-watermark]', path.basename(file), msg);
    return n >= MAX_TRIES ? 'gave-up' : 'failed';
  }
}
