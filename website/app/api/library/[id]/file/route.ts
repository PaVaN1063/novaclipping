import path from 'path';
import { currentUser, signedLink, unauthorized } from '@/lib/auth';
import { serveVideo } from '@/lib/serve-file';
import { readDb } from '@/lib/store';
import { STUDIO_API, STUDIO_OUTPUT } from '@/lib/studio-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The full-quality clip. ?wm=1 burns your watermark text in (if one is set).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser()) && !(await signedLink(req))) return unauthorized();
  const { id } = await params;
  const c = (await readDb()).library.find((x) => x.id === id);
  if (!c?.file) return new Response('Not found', { status: 404 });
  const name = `${c.title || 'clip'}.mp4`;

  if (new URL(req.url).searchParams.get('wm') === '1') {
    const rel = path.relative(STUDIO_OUTPUT, c.file).split(path.sep);
    if (rel.length === 2 && !rel[0].startsWith('..')) {
      const r = await fetch(`${STUDIO_API}/api/nova/watermark/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: `/videos/${rel[0]}/${rel[1]}` }),
      }).catch(() => null);
      if (r?.ok && r.body) {
        return new Response(r.body, {
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Disposition': `attachment; filename="${name.replace(/[^\w.\- ]+/g, '_')}"`,
            'Cache-Control': 'no-store',
          },
        });
      }
      // No watermark text set (or it failed): fall through to the original.
    }
  }
  return serveVideo(req, c.file, name);
}
