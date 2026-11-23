import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { tick } from '@/lib/worker';
import { finishConnect, redirectUri } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

// Google sends you back here after you allow access.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = (process.env.APP_URL || url.origin).replace(/\/+$/, '');
  const back = (q: string) => {
    const res = NextResponse.redirect(`${origin}/settings?${q}`);
    res.cookies.set('yt_state', '', { path: '/', maxAge: 0 });
    return res;
  };

  if (!(await currentUser())) return NextResponse.redirect(`${origin}/login?next=/settings`);

  const err = url.searchParams.get('error');
  if (err) return back(`yt=error&msg=${encodeURIComponent(err === 'access_denied' ? 'You cancelled the Google sign-in.' : err)}`);

  const store = await cookies();
  const state = url.searchParams.get('state');
  if (!state || state !== store.get('yt_state')?.value) return back(`yt=error&msg=${encodeURIComponent('Sign-in check failed. Please try again.')}`);

  const code = url.searchParams.get('code');
  if (!code) return back(`yt=error&msg=${encodeURIComponent('Google did not send a sign-in code.')}`);

  try {
    await finishConnect(code, redirectUri(origin));
  } catch (e) {
    return back(`yt=error&msg=${encodeURIComponent(e instanceof Error ? e.message : 'Could not connect YouTube.')}`);
  }

  void tick(); // send anything that was waiting for YouTube
  return back('yt=connected');
}
