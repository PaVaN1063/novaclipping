import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, readSession } from '@/lib/session';
import { ENGINE_SECRET, ROLE, APP_URL } from '@/lib/role';
import { safeEqual, verifyPath } from '@/lib/hmac';

// Locked by default: every path goes through here, and only the few below are
// open without signing in.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};

const PUBLIC = new Set(['/', '/login', '/api/auth/google/start', '/api/auth/google/callback', '/api/auth/logout', '/api/health']);

// Big files skip the web copy and go to the engine directly with a signed link.
const DIRECT = /^\/api\/((uploads|clips)\/[A-Za-z0-9]+\/file|library\/[A-Za-z0-9]+\/(file|preview))$/;

const deny = (status = 401, error = 'Please sign in.') => NextResponse.json({ ok: false, error }, { status });

function cors(res: NextResponse) {
  if (APP_URL) {
    res.headers.set('Access-Control-Allow-Origin', APP_URL);
    res.headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.headers.set('Access-Control-Max-Age', '600');
    res.headers.set('Vary', 'Origin');
  }
  return res;
}

function toLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  if (APP_URL) {
    const pub = new URL(APP_URL);
    url.protocol = pub.protocol;
    url.host = pub.host;
    url.port = pub.port;
  }
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

async function engine(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === '/api/health') return NextResponse.next();
  if (!pathname.startsWith('/api/')) return new NextResponse('Not found', { status: 404 });

  // Instagram downloads videos here; the route checks its own signature.
  if (pathname.startsWith('/api/media/')) return NextResponse.next();
  // Big files: a signed link made by the website for this exact path.
  if (DIRECT.test(pathname)) {
    if (req.method === 'OPTIONS') return cors(new NextResponse(null, { status: 204 }));
    if (await verifyPath(ENGINE_SECRET, pathname, searchParams.get('t'))) return cors(NextResponse.next());
  }
  // Everything else: only the website's own server, holding the shared secret.
  const key = req.headers.get('x-engine-key') || '';
  if (ENGINE_SECRET && safeEqual(key, ENGINE_SECRET)) return NextResponse.next();
  // The Studio on the same VM posts clips with its link key (checked in the route).
  if (req.headers.get('x-nova-key')) return NextResponse.next();
  return deny();
}

export async function middleware(req: NextRequest) {
  if (ROLE === 'engine') return engine(req);

  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');
  // Nobody may pass these in from outside; only this middleware sets them.
  const headers = new Headers(req.headers);
  headers.delete('x-nova-user');
  headers.delete('x-engine-key');

  if (PUBLIC.has(pathname)) return NextResponse.next({ request: { headers } });

  const session = await readSession(req.cookies.get(COOKIE)?.value);
  if (!session) return isApi ? deny() : toLogin(req);
  headers.set('x-nova-user', session.user);

  // Web copy: hand every API call to the engine through one route.
  if (ROLE === 'web' && isApi && !pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/engine-proxy/')) {
    const url = req.nextUrl.clone();
    url.pathname = `/api/engine-proxy${pathname.slice(4)}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}
