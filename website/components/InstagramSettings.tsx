'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { IconInstagram } from './Icons';

type Props = { connected: boolean; account: string | null; publicUrl: string; expiresAt: number | null };

export default function InstagramSettings({ connected, account, publicUrl: savedUrl, expiresAt }: Props) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [url, setUrl] = useState(savedUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function call(path: string, body: unknown, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json()) as { ok: boolean; error?: string; username?: string };
    setBusy(false);
    if (!j.ok) return setMsg({ text: j.error || 'Something went wrong.', ok: false });
    setMsg({ text: done.replace('{user}', j.username ? `@${j.username}` : ''), ok: true });
    setToken('');
    router.refresh();
  }

  const connect = (e: FormEvent) => {
    e.preventDefault();
    call('/api/instagram', { token }, 'Connected {user}.');
  };
  const saveUrl = (e: FormEvent) => {
    e.preventDefault();
    call('/api/settings/public-url', { url }, url ? 'Public address works and is saved.' : 'Public address removed.');
  };

  const daysLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 86_400_000)) : null;
  const ready = connected && !!savedUrl;

  return (
    <section className="card" style={{ gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--ig)' }}><IconInstagram size={28} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ fontSize: 18 }}>Instagram</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {connected ? `Connected as ${account}${daysLeft !== null ? ` · token renews automatically (${daysLeft} days left)` : ''}` : 'Not connected'}
          </span>
        </div>
        <span className={`chip ${ready ? 'chip-ok' : 'chip-warn'}`}>{ready ? 'Ready to post' : connected ? 'Needs public address' : 'Not connected'}</span>
        {connected ? (
          <button type="button" className="btn btn-ghost" style={{ fontSize: 14 }} disabled={busy} onClick={() => call('/api/instagram', { disconnect: true }, 'Disconnected.')}>Disconnect</button>
        ) : null}
      </div>

      {!connected ? (
        <form onSubmit={connect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            <span>Instagram access token</span>
            <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token from your Meta app" autoComplete="off" required />
            <span className="hint">Kept only on this computer. Nova renews it before it expires.</span>
          </label>
          <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Connect Instagram'}</button></div>
        </form>
      ) : null}

      <form onSubmit={saveUrl} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          <span>Public address of this site</span>
          <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://something.trycloudflare.com" autoComplete="off" />
          <span className="hint">
            Instagram downloads each Reel from here using a private link that expires after 3 hours. On your laptop, double-click <code>start-tunnel.bat</code> and paste the https address it prints. On the server, this is the site’s own address.
          </span>
        </label>
        <div><button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? 'Checking…' : 'Check & save address'}</button></div>
      </form>

      {msg ? <p className={msg.ok ? 'hint' : 'error'} role="status" style={msg.ok ? { color: 'var(--ok)' } : undefined}>{msg.text}</p> : null}
    </section>
  );
}
