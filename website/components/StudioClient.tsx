'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  studioUrl: string;
  linked: boolean;
  seenAt: string | null;
  youtube: string | null;
  instagram: string | null;
  gemini: boolean;
};

function ago(iso: string | null) {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// The real clipping tool runs inside this page. On load the page hands the
// Studio its link key (postMessage, only to the Studio's own address), so the
// two stay linked: the Studio's schedule window posts through this site, and
// YouTube / Instagram / Gemini settings are shared both ways.
export default function StudioClient({ studioUrl, linked, seenAt, youtube, instagram, gemini }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState(studioUrl);
  const [draft, setDraft] = useState(studioUrl);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<'loading' | 'linked' | 'offline' | 'blocked' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [nonce, setNonce] = useState(0);
  const keyRef = useRef<string | null>(null);

  let studioOrigin = '';
  try {
    studioOrigin = new URL(url).origin;
  } catch {}

  const getKey = useCallback(async (studio?: string) => {
    const r = await fetch('/api/settings/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studio ? { studioUrl: studio } : {}),
    });
    const j = (await r.json()) as { ok: boolean; key?: string; error?: string };
    if (!j.ok || !j.key) throw new Error(j.error || 'Could not get the link key.');
    keyRef.current = j.key;
    return j.key;
  }, []);

  // The Studio answers "nova-studio-ready" when it loads and "nova-linked" after it checked the key.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== studioOrigin || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'nova-studio-ready') {
        (keyRef.current ? Promise.resolve(keyRef.current) : getKey())
          .then((key) => frame.current?.contentWindow?.postMessage({ type: 'nova-link', key, site: window.location.origin }, studioOrigin))
          .catch((err: Error) => {
            setState('error');
            setMsg(err.message);
          });
      }
      if (e.data.type === 'nova-linked') {
        setState(e.data.ok ? 'linked' : 'error');
        setMsg(e.data.ok ? '' : e.data.error || 'The Studio could not reach this site.');
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [studioOrigin, getKey]);

  // No answer at all means the Studio isn't running (or is an old version).
  useEffect(() => {
    setState('loading');
    const t = setTimeout(async () => {
      // Is the Studio up at all? (no-cors: only tells us it answered)
      let up = false;
      try {
        await fetch(`${url}/`, { mode: 'no-cors', cache: 'no-store' });
        up = true;
      } catch {}
      setState((s) => (s === 'loading' ? (up ? 'blocked' : 'offline') : s));
    }, 12000);
    return () => clearTimeout(t);
  }, [url, nonce]);

  async function saveUrl() {
    try {
      await getKey(draft);
      setUrl(draft.replace(/\/+$/, ''));
      setEditing(false);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const dot = (on: boolean) => <span className="dot" style={{ background: on ? 'var(--ok)' : 'var(--warn)' }} />;

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display">Nova Studio</h1>
          <p className="muted">Clip long gameplay, add your watermark, then schedule straight to YouTube and Instagram.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`chip ${state === 'linked' ? 'chip-ok' : state === 'loading' ? '' : 'chip-warn'}`}>
            {state === 'linked' ? 'Studio linked' : state === 'loading' ? 'Opening Studio…' : state === 'offline' ? 'Studio not shown' : state === 'blocked' ? 'Open in new tab' : 'Link problem'}
          </span>
          <span className={`chip ${youtube ? 'chip-yt' : ''}`}>{dot(!!youtube)} YouTube{youtube ? ` · ${youtube}` : ' · not connected'}</span>
          <span className={`chip ${instagram ? 'chip-ig' : ''}`}>{dot(!!instagram)} Instagram{instagram ? ` · ${instagram}` : ' · not connected'}</span>
          <span className={`chip ${gemini ? 'chip-ok' : ''}`}>{dot(gemini)} Gemini</span>
        </div>
      </div>

      {state === 'offline' ? (
        <div className="banner banner-warn" role="alert" style={{ flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 300px' }}>Can&apos;t show the Studio here. If it&apos;s running, open it in its own tab (it stays linked). If not, start it with <code>restart-studio.bat</code> in the novaclipping folder.</span>
          <a className="btn btn-primary" style={{ fontSize: 14, padding: '6px 12px' }} href={`${url}/#app`} target="_blank" rel="noreferrer">Open Studio</a>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 14, padding: '6px 12px' }} onClick={() => setNonce((n) => n + 1)}>try again</button>
        </div>
      ) : null}
      {state === 'blocked' ? (
        <div className="banner banner-warn" role="alert" style={{ flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 300px' }}>The Studio is running, but this browser won&apos;t show it inside the page. Open it in its own tab; it stays linked to this site.</span>
          <a className="btn btn-primary" style={{ fontSize: 14, padding: '6px 12px' }} href={`${url}/#app`} target="_blank" rel="noreferrer">Open Studio</a>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 14, padding: '6px 12px' }} onClick={() => setNonce((n) => n + 1)}>try again</button>
        </div>
      ) : null}
      {state === 'error' ? <div className="banner banner-warn" role="alert">{msg}</div> : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }} className="muted">
        {editing ? (
          <>
            <input className="input" style={{ maxWidth: 320 }} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Studio address" />
            <button type="button" className="btn btn-primary" style={{ fontSize: 14 }} onClick={saveUrl}>Save</button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 14 }} onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <span>Studio at <code>{url}</code> · last sync {ago(seenAt)}{linked ? '' : ' · links on first open'}</span>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => setEditing(true)}>Change address</button>
            <a className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} href={`${url}/#app`} target="_blank" rel="noreferrer">Open in new tab</a>
            <Link className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} href="/settings">Connections</Link>
          </>
        )}
      </div>

      <iframe
        key={`${url}-${nonce}`}
        ref={frame}
        src={`${url}/#app`}
        title="Nova Studio"
        allow="clipboard-read; clipboard-write; fullscreen"
        style={{ width: '100%', height: 'calc(100vh - 230px)', minHeight: 620, border: '1px solid var(--line, rgba(127,127,127,.25))', borderRadius: 16, background: 'var(--surface)' }}
      />
    </>
  );
}
