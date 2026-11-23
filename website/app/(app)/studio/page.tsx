import StudioClient from '@/components/StudioClient';
import { readDb } from '@/lib/store';
import { DEFAULT_STUDIO_URL } from '@/lib/studio';

export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  const db = await readDb();
  return (
    <StudioClient
      studioUrl={db.prefs.studioUrl || DEFAULT_STUDIO_URL}
      youtube={db.connections.youtube.connected ? db.connections.youtube.account || 'connected' : null}
      instagram={db.connections.instagram.connected ? db.connections.instagram.account || 'connected' : null}
      gemini={!!db.secrets.gemini.apiKey}
    />
  );
}
