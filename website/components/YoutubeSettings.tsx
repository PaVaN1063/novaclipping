'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { IconYouTube } from './Icons';

type Props = {
  clientId: string;
  hasSecret: boolean;
  connected: boolean;
  account: string | null;
  redirect: string;
};

export default function YoutubeSettings({ clientId: savedId, hasSecret, connected, account, redirect }: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState(savedId);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const keysSaved = !!savedId && hasSecret;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/settings/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret: secret }),
    });
    const j = (await r.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (!j.ok) return setMsg({ text: j.error || 'Could not save.', ok: false });
    setSecret('');
    setMsg({ text: 'Saved. Now press Connect YouTube.', ok: true });
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    await fetch('/api/youtube/disconnect', { method: 'POST' });
    setBusy(false);
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(redirect);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <section className="card" style={{ gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--yt)' }}><IconYouTube size={28} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ fontSize: 18 }}>YouTube</h2>
          <span className="muted" style={{ fontSize: 14 }}>{connected ? `Connected as ${account}` : 'Not connected'}</span>
        </div>
        {connected ? (
          <>
            <span className="chip chip-ok">Connected</span>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 14 }} onClick={disconnect} disabled={busy}>Disconnect</button>
          </>
        ) : (
          <a
            href={keysSaved ? '/api/youtube/connect' : undefined}
            aria-disabled={!keysSaved}
            className="btn btn-primary"
            style={{ fontSize: 14, pointerEvents: keysSaved ? undefined : 'none', opacity: keysSaved ? 1 : 0.5 }}
          >
            Connect YouTube
          </a>
        )}
      </div>

      <div className="field">
        <span>Authorized redirect URI (paste this into Google Cloud)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" readOnly value={redirect} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-ghost" style={{ fontSize: 14 }} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          <span>Client ID</span>
          <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234…apps.googleusercontent.com" autoComplete="off" required />
        </label>
        <label className="field">
          <span>Client secret</span>
          <input
            className="input"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={hasSecret ? 'Saved — leave empty to keep it' : 'GOCSPX-…'}
            autoComplete="off"
            required={!hasSecret}
          />
          <span className="hint">Kept only on this computer, in data/nova.json. Never shown again.</span>
        </label>
        {msg ? <p className={msg.ok ? 'hint' : 'error'} role="status" style={msg.ok ? { color: 'var(--ok)' } : undefined}>{msg.text}</p> : null}
        <div>
          <button type="submit" className="btn btn-ghost" disabled={busy}>{busy ? 'Saving…' : 'Save keys'}</button>
        </div>
      </form>
    </section>
  );
}
