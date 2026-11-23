import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';

/** Stream a video with Range support (so the browser can seek). */
export async function serveVideo(req: Request, file: string, downloadName?: string): Promise<Response> {
  const st = await fs.stat(file).catch(() => null);
  if (!st) return new Response('Not found', { status: 404 });
  const range = req.headers.get('range');
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };
  if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName.replace(/[^\w.\- ]+/g, '_')}"`;
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
    const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(body, { headers: { ...headers, 'Content-Length': String(st.size) } });
}
