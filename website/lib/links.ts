import { signPath } from './hmac';
import { ENGINE_SECRET, PUBLIC_ENGINE_URL, ROLE } from './role';

/** A link the browser can open directly on the engine (videos never go through Netlify). */
export async function directLink(p: string, ttlSec = 6 * 3600, query = ''): Promise<string> {
  if (ROLE !== 'engine' || !PUBLIC_ENGINE_URL || !ENGINE_SECRET) return `${p}${query ? `?${query}` : ''}`;
  const t = await signPath(ENGINE_SECRET, p, ttlSec);
  return `${PUBLIC_ENGINE_URL}${p}?t=${encodeURIComponent(t)}${query ? `&${query}` : ''}`;
}
