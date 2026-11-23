import StudioClient from '@/components/StudioClient';
import { readDb } from '@/lib/store';
import { DEFAULT_STUDIO_URL } from '@/lib/studio';

export const dynamic = 'force-dynamic';

// The Nova Studio clipping tool, opened inside the website.
export default async function StudioPage() {
  const db = await readDb();
  return (
    <StudioClient
      studioUrl={db.prefs.studioUrl || DEFAULT_STUDIO_URL}
      linked={!!db.prefs.linkKey}
      seenAt={db.prefs.studioSeenAt || null}
      youtube={db.connections.youtube.connected ? db.connections.youtube.account || 'connected' : null}
      instagram={db.connections.instagram.connected ? db.connections.instagram.account || 'connected' : null}
      gemini={!!db.secrets.gemini.apiKey}
    />
  );
}
