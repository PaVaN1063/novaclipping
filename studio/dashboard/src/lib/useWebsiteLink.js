import { useEffect, useRef } from 'react';
import { connect, consumePending, inFrame, loadStatus, readState, sync } from './websiteLink';

// Websites allowed to hand this Studio a link key through postMessage: ones on
// this computer, or the website it is already linked to.
function trusted(origin) {
  try {
    const u = new URL(origin);
    if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return true;
    const saved = readState()?.site_url;
    return !!saved && new URL(saved).origin === u.origin;
  } catch {
    return false;
  }
}

// Nova Clipping: keeps the Studio linked and in sync with the website.
export function useWebsiteLink(apiKey, setApiKey) {
  const first = useRef(true);

  // Open: finish a one-click link, else sync if already linked. Then every 2 min.
  useEffect(() => {
    const start = () => consumePending()
      .then((done) => done || loadStatus().then((s) => (s.has_key ? sync() : null)))
      .catch(() => {});
    start();
    const t = setInterval(() => { if (readState()?.has_key) sync().catch(() => {}); }, 120000);
    const onKey = (e) => setApiKey(e.detail);
    window.addEventListener('nova:gemini-key', onKey);
    return () => { clearInterval(t); window.removeEventListener('nova:gemini-key', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Gemini key changed here: tell the website (a little after typing stops).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!apiKey || !readState()?.has_key) return;
    const t = setTimeout(() => sync().catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [apiKey]);

  // Inside the website's Studio page: the website hands over the link key.
  useEffect(() => {
    if (!inFrame) return;
    const onMsg = async (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object' || d.type !== 'nova-link') return;
      if (!d.key || !d.site || new URL(d.site).origin !== e.origin || !trusted(e.origin)) return;
      try {
        const st = readState();
        if (!(st?.has_key && st.site_url === d.site && !st.refused)) await connect(d.site, d.key);
        else await sync();
        e.source?.postMessage({ type: 'nova-linked', ok: true }, e.origin);
      } catch (err) {
        e.source?.postMessage({ type: 'nova-linked', ok: false, error: err?.message || 'link failed' }, e.origin);
      }
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: 'nova-studio-ready' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
}
