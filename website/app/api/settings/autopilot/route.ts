import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { isPlatform } from '@/lib/platforms';
import { INBOX_DIR, updateDb } from '@/lib/store';

const GAPS = [1, 2, 3, 6, 12, 24];

export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const b = (await req.json().catch(() => null)) as {
    enabled?: boolean;
    platforms?: string[];
    mode?: string;
    gapHours?: number;
    caption?: string;
    deleteAfterPost?: boolean;
  } | null;
  if (!b) return badRequest('Bad request.');

  const platforms = Array.from(new Set(b.platforms || [])).filter(isPlatform);
  if (b.enabled && platforms.length === 0) return badRequest('Pick at least one platform for Autopilot.');

  await updateDb((d) => {
    d.autopilot = {
      enabled: !!b.enabled,
      platforms: platforms.length ? platforms : d.autopilot.platforms,
      mode: b.mode === 'draft' ? 'draft' : 'schedule',
      gapHours: GAPS.includes(Number(b.gapHours)) ? Number(b.gapHours) : d.autopilot.gapHours,
      caption: String(b.caption || '').slice(0, 2200),
    };
    d.prefs.deleteAfterPost = !!b.deleteAfterPost;
  });
  await fs.mkdir(path.join(INBOX_DIR, 'done'), { recursive: true });
  return NextResponse.json({ ok: true });
}
