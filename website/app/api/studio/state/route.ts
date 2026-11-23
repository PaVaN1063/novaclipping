import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { directLink } from '@/lib/links';
import { readDb } from '@/lib/store';
import { currentScore, storage } from '@/lib/studio-engine';
import { publishers } from '@/lib/publishers';
import { PLATFORM_IDS } from '@/lib/platforms';

export const dynamic = 'force-dynamic';

const REMIND_EVERY = 3 * 86_400_000;

// Everything the Studio page shows, without file locations or keys.
export async function GET() {
  const user = await currentUser();
  if (!user || user.user === 'studio') return unauthorized();
  const db = await readDb();
  const s = await storage().catch(() => null);

  const library = await Promise.all(
    db.library.map(async (c) => ({
      id: c.id,
      projectId: c.projectId,
      jobId: c.jobId,
      title: c.title,
      description: c.description,
      hashtags: c.hashtags,
      size: c.size,
      duration: c.duration,
      viralScore: c.viralScore,
      currentScore: currentScore(c),
      status: c.status,
      statusAt: c.statusAt,
      createdAt: c.createdAt,
      scheduledFor: c.scheduledFor,
      postedAt: c.postedAt,
      postedTo: c.postedTo,
      autoPosted: c.autoPosted,
      preview: c.preview ? await directLink(`/api/library/${c.id}/preview`) : null,
      download: c.file ? await directLink(`/api/library/${c.id}/file`, 6 * 3600, 'wm=1') : null,
      original: c.file ? await directLink(`/api/library/${c.id}/file`) : null,
    }))
  );

  const posted = db.library.filter((c) => c.status === 'posted');
  const reminderDue =
    posted.length > 0 && (!db.studio.lastReminderAt || Date.now() - Date.parse(db.studio.lastReminderAt) > REMIND_EVERY);

  return NextResponse.json({
    ok: true,
    projects: db.projects,
    jobs: db.jobs,
    library,
    settings: { ...db.studio },
    connected: Object.fromEntries(PLATFORM_IDS.map((p) => [p, publishers[p].isConnected(db)])),
    gemini: !!db.secrets.gemini.apiKey,
    mail: !!(db.secrets.mail.user && db.secrets.mail.appPassword),
    storage: s ? { usedBytes: s.usedBytes, limitBytes: db.studio.storageLimitGb * 1024 ** 3, diskFree: s.diskFree, diskTotal: s.diskTotal } : null,
    reminder: reminderDue ? posted.map((c) => c.id) : [],
  });
}
