'use client';

import { useEffect, useState } from 'react';

type Status = { set: boolean; savedAt?: string; cookies?: number; loggedIn?: boolean; expires?: string | null };

// Cookies that let the VM download YouTube links (YouTube blocks cloud servers
// without a signed-in session). Saved on the VM only; never shown again.
export default function YoutubeCookiesSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await fetch('/api/settings/ytcookies', { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as Status;
    setSt(j);
  }
  useEffect(() => { load(); }, []);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/settings/ytcookies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (j.ok) setText('');
    setMsg(j.ok ? { ok: true, text: done } : { ok: false, text: j.error || 'Could not save.' });
    load();
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setText(await f.text());
  }

  const on = !!st?.set;
  return (
    <section className="card" style={{ gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 18 }}>YouTube links</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            YouTube blocks cloud servers with “confirm you’re not a bot”. Give the VM the cookies of a signed-in YouTube session so pasted links download. Uploading a video file always works without this.
          </span>
        </div>
        <span className={`chip ${on ? 'chip-ok' : 'chip-warn'}`}>{st === null ? 'Checking…' : on ? 'Cookies saved' : 'Links blocked — add cookies'}</span>
      </div>
      {on ? (
        <span className="hint">
          {st?.cookies} YouTube cookies{st?.loggedIn ? ', signed in' : ''} · saved {st?.savedAt ? new Date(st.savedAt).toLocaleString() : ''}
          {st?.expires ? ` · earliest expiry ${new Date(st.expires).toLocaleDateString()}` : ''}. If links start failing again, export fresh cookies.
        </span>
      ) : null}
      <label className="field"><span>cookies.txt {on ? '(saved — paste or pick a new file to replace)' : ''}</span>
        <textarea className="input" rows={4} spellCheck={false} autoComplete="off" placeholder="# Netscape HTTP Cookie File …" value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </label>
      <input type="file" accept=".txt,text/plain" onChange={(e) => pickFile(e.target.files?.[0])} />
      <span className="hint">
        Best with a spare Google account: open a private window, sign in on youtube.com, export cookies with a “Get cookies.txt LOCALLY” extension, then close the private window without signing out. Kept on your VM only.
      </span>
      {msg ? <p className={msg.ok ? 'hint' : 'error'}>{msg.text}</p> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => send({ text }, 'Saved. Try your YouTube link again.')}>Save cookies</button>
        <button type="button" className="btn btn-ghost" disabled={busy || !on} onClick={() => send({ remove: true }, 'Removed.')}>Remove</button>
      </div>
    </section>
  );
}
