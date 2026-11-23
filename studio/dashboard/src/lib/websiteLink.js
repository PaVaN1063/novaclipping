// Nova Clipping: the link between this Studio and the Nova Clipping website.
//
// - One-click connect: "connect" opens <website>/studio/connect, which sends
//   you back here with the link key in the address (#nova-link=…&nova-site=…).
// - Inside the website's Studio page, the website hands the key over with a
//   postMessage instead.
// - Sync (on open, every 2 minutes, and when the Gemini key changes): sends the
//   Studio's Gemini key, address and watermark; gets the website's YouTube /
//   Instagram / Gemini status back. The newer Gemini key wins on both sides.
import { apiJson } from './api';
import { getWmSettings } from './novaWatermark';

export const LINK_EVENT = 'nova:website-link';
const STATE_KEY = 'nova_site_state_v1';
const PENDING_KEY = 'nova_pending_link';
export const GEMINI_KEY = 'gemini_key';
export const GEMINI_TIME = 'gemini_updated_at';
export const DEFAULT_SITE = 'http://localhost:3000';

export const inFrame = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

// Called from main.jsx before React mounts: keep the key from the address and
// tidy the address back to the app.
export function captureLinkFromHash() {
  const h = window.location.hash || '';
  if (!h.includes('nova-link=')) return;
  const q = new URLSearchParams(h.replace(/^#\/?/, ''));
  const key = q.get('nova-link');
  const site = q.get('nova-site');
  if (key && site) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ key, site })); } catch { /* ignore */ }
  }
  try { window.history.replaceState(null, '', `${window.location.pathname}#app?tab=settings`); } catch { window.location.hash = '#app'; }
}

export function readState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; }
}

function writeState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(LINK_EVENT, { detail: s }));
}

export function siteUrl() {
  return readState()?.site_url || DEFAULT_SITE;
}

export async function connect(site, key) {
  const s = await apiJson('/api/nova/publish/link/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_url: site, key }),
  });
  writeState({ ...readState(), ...s, linked: true, online: true, error: null });
  return sync();
}

export async function unlink() {
  const s = await apiJson('/api/nova/publish/link/unlink', { method: 'POST' });
  writeState({ ...s, linked: false, site: null });
  return s;
}

export async function consumePending() {
  let p = null;
  try { p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  if (!p) return null;
  return connect(p.site, p.key);
}

let syncing = null;
export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    let wm = '';
    try { wm = (await getWmSettings())?.text || ''; } catch { /* ignore */ }
    const body = {
      gemini_key: localStorage.getItem(GEMINI_KEY) || null,
      gemini_updated_at: localStorage.getItem(GEMINI_TIME) || null,
      studio_url: window.location.origin,
      watermark: wm || null,
    };
    const s = await apiJson('/api/nova/publish/link/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // The website's Gemini key is newer (or this Studio has none): use it here too.
    const g = s?.site?.gemini;
    if (g?.apiKey && g.apiKey !== body.gemini_key) {
      const theirs = Date.parse(g.updatedAt || '') || 0;
      const mine = Date.parse(body.gemini_updated_at || '') || 0;
      if (!body.gemini_key || theirs >= mine) { // a tie goes to the website
        localStorage.setItem(GEMINI_TIME, g.updatedAt || new Date().toISOString());
        localStorage.setItem(GEMINI_KEY, g.apiKey);
        window.dispatchEvent(new CustomEvent('nova:gemini-key', { detail: g.apiKey }));
      }
    }
    if (s?.site?.gemini) delete s.site.gemini.apiKey; // never keep it in the status copy
    writeState({ ...s, checkedAt: new Date().toISOString() });
    return s;
  })().finally(() => { syncing = null; });
  return syncing;
}

export async function loadStatus() {
  const s = await apiJson('/api/nova/publish/settings');
  writeState({ ...readState(), ...s, linked: !!s.has_key });
  return s;
}

// Open a page of the website: inside the website's Studio page, move the whole
// page; otherwise a new tab.
export function openSite(path = '/dashboard') {
  const url = `${siteUrl()}${path}`;
  if (inFrame) {
    try { window.top.location.href = url; return; } catch { /* cross-origin top: fall through */ }
  }
  window.open(url, '_blank', 'noopener');
}

export function connectUrl() {
  const back = `${window.location.origin}/`;
  return `${siteUrl()}/studio/connect?return=${encodeURIComponent(back)}`;
}
