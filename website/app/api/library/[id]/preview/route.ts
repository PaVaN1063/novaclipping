import { currentUser, signedLink, unauthorized } from '@/lib/auth';
import { serveVideo } from '@/lib/serve-file';
import { readDb } from '@/lib/store';

export const runtime = 'nodejs';

// The small preview copy, for watching in the browser.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser()) && !(await signedLink(req))) return unauthorized();
  const { id } = await params;
  const c = (await readDb()).library.find((x) => x.id === id);
  if (!c?.preview) return new Response('Not found', { status: 404 });
  return serveVideo(req, c.preview);
}
