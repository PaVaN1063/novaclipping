
import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';
import { newLinkKey } from '@/lib/studio';

// Create (or replace) the key the Nova Studio clipping tool uses to send clips here.
// Only you, signed in on the site, can do this — not the tool itself.
export async function POST() {
  const user = await currentUser();
  if (!user || user.user === 'studio') return unauthorized();
  const key = newLinkKey();
  await updateDb((d) => {
    d.prefs.linkKey = key;
  });
  return NextResponse.json({ ok: true, key });
}
