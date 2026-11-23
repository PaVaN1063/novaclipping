import { NextResponse } from 'next/server';
import { ENGINE_SECRET, ENGINE_URL, ROLE } from '@/lib/role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Web copy only: pass one API call on to the engine on the VM, with the shared
// secret and the signed-in user (set by middleware, never by the browser).
async function pass(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (ROLE !== 'web' || !ENGINE_URL || !ENGINE_SECRET) {
    return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }
  const user = req.headers.get('x-nova-user');
  if (!user) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });

  const { path } = await params;
  const src = new URL(req.url);
  const target = `${ENGINE_URL}/api/${path.map(encodeURIComponent).join('/')}${src.search}`;

  const headers = new Headers();
  for (const h of ['content-type', 'cookie', 'accept', 'range']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('x-engine-key', ENGINE_SECRET);
  headers.set('x-nova-user', user);

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'The Nova Clipping engine (VM) is not answering. Try again in a minute.' }, { status: 502 });
  }

  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-disposition', 'location', 'cache-control', 'content-range', 'accept-ranges']) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  for (const c of cookies) out.append('set-cookie', c);
  return new NextResponse(res.body, { status: res.status, headers: out });
}

export { pass as GET, pass as POST, pass as PUT, pass as PATCH, pass as DELETE };
