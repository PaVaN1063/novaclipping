import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, readSession } from '@/lib/session';

// Every page behind login. The landing page and /login stay public.
export const config = {
  matcher: ['/dashboard/:path*', '/upload/:path*', '/schedule/:path*', '/studio/:path*', '/settings/:path*', '/batches/:path*'],
};

export async function middleware(req: NextRequest) {
  const session = await readSession(req.cookies.get(COOKIE)?.value);
  if (session) return NextResponse.next();

  // Behind Netlify the request arrives with the server's own name; send people
  // back to the public address (APP_URL) instead.
  const url = req.nextUrl.clone();
  if (process.env.APP_URL) {
    const pub = new URL(process.env.APP_URL);
    url.protocol = pub.protocol;
    url.host = pub.host;
    url.port = pub.port;
  }
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}
