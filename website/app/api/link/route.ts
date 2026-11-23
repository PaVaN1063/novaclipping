import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { readDb, updateDb, type Db } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The link between this site and the Nova Studio clipping tool.
// GET  — the Studio checks its link key and reads what is connected here.
// POST — two-way sync: the Studio sends its side (Gemini key, its address,
//        watermark text) and gets this site's side back. For the Gemini key
//        the newer one wins, so changing it in either place updates both.

function snapshot(db: Db, withKey: boolean) {
  const g = db.secrets.gemini;
  return {
    ok: true,
    app: 'nova-clipping',
    youtube: { connected: db.connections.youtube.connected, account: db.connections.youtube.account },
    instagram: { connected: db.connections.instagram.connected, account: db.connections.instagram.account },
    gemini: { set: !!g.apiKey, updatedAt: g.updatedAt || null, ...(withKey ? { apiKey: g.apiKey } : {}) },
    autopilot: { enabled: db.autopilot.enabled },
    studio: { url: db.prefs.studioUrl || null, seenAt: db.prefs.studioSeenAt || null },
  };
}

export async function GET() {
  if (!(await currentUser())) return unauthorized();
  return NextResponse.json(snapshot(await readDb(), false));
}

type SyncBody = {
  gemini?: { apiKey?: string | null; updatedAt?: string | null };
  studioUrl?: string | null;
  watermark?: string | null;
};

const time = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.user !== 'studio') return unauthorized();
  const body = ((await req.json().catch(() => null)) || {}) as SyncBody;

  await updateDb((d) => {
    d.prefs.studioSeenAt = new Date().toISOString();
    const url = (body.studioUrl || '').trim();
    if (/^https?:\/\/[^\s]+$/.test(url) && url.length < 300) d.prefs.studioUrl = url.replace(/\/+$/, '');
    const wm = (body.watermark || '').trim();
    if (wm) d.prefs.watermark = wm.slice(0, 80);

    const theirs = (body.gemini?.apiKey || '').trim();
    const g = d.secrets.gemini;
    if (theirs.length >= 20 && theirs !== g.apiKey) {
      // Take the Studio's key when this site has none, or the Studio's is newer.
      if (!g.apiKey || time(body.gemini?.updatedAt) > time(g.updatedAt)) {
        g.apiKey = theirs;
        g.updatedAt = body.gemini?.updatedAt || new Date().toISOString();
      }
    }
  });
  return NextResponse.json(snapshot(await readDb(), true));
}
