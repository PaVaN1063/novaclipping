// Nova Clipping: shared access to the text-watermark settings
// (nova_watermark.py). One fetch for the whole page; every clip card and the
// Settings card read and write through here so they stay in step.
import { apiJson } from './api';

export const WM_EVENT = 'nova:watermark-settings';
let cache = null;

export function getWmSettings(force = false) {
  if (!cache || force) {
    cache = apiJson('/api/nova/watermark/settings').catch((e) => { cache = null; throw e; });
  }
  return cache;
}

export async function saveWmSettings(patch) {
  const current = await getWmSettings().catch(() => ({}));
  const next = {
    text: current.text || '', position: current.position || 'top-center',
    size: current.size ?? 0.045, opacity: current.opacity ?? 0.75, ...patch,
  };
  const saved = await apiJson('/api/nova/watermark/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: next.text, position: next.position, size: next.size, opacity: next.opacity }),
  });
  cache = Promise.resolve({ ...current, ...saved });
  window.dispatchEvent(new CustomEvent(WM_EVENT, { detail: saved }));
  return saved;
}
