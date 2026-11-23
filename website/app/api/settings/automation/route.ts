import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { isPlatform, type Platform } from '@/lib/platforms';
import { updateDb } from '@/lib/store';

// Studio automation: auto-post 90+, where clips go, spacing, parallel projects, storage limit.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const b = (await req.json().catch(() => null)) as {
    autoPost?: boolean; platforms?: string[]; gapHours?: number; maxParallel?: number; storageLimitGb?: number;
  } | null;
  if (!b) return badRequest('Bad request.');
  await updateDb((d) => {
    const s = d.studio;
    if (typeof b.autoPost === 'boolean') s.autoPost = b.autoPost;
    if (Array.isArray(b.platforms)) {
      const p = b.platforms.filter(isPlatform) as Platform[];
      if (p.length) s.platforms = p;
    }
    if ([1, 2, 3, 4, 6, 12, 24].includes(Number(b.gapHours))) s.gapHours = Number(b.gapHours);
    if ([1, 2, 3].includes(Number(b.maxParallel))) s.maxParallel = Number(b.maxParallel);
    if (Number(b.storageLimitGb) >= 10 && Number(b.storageLimitGb) <= 145) s.storageLimitGb = Math.round(Number(b.storageLimitGb));
  });
  return NextResponse.json({ ok: true });
}
