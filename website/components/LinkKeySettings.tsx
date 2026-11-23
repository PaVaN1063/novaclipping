'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// The key the Nova Studio clipping tool uses to send finished clips here,
// so you can schedule them on YouTube / Instagram from the Studio's "schedule" window.
export default function LinkKeySettings({ linkKey, seenAt, studioUrl }: { linkKey: string; seenAt: string | null; studioUrl: string }) {
  const router = useRouter();
  const [key, setKey] = useState(linkKey);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);

  async function create() {
    if (key && !window.confirm('Make a new key? The Studio will need the new one pasted in.')) return;
    setBusy(true);
    const r = await fetch('/api/settings/link-key', { method: 'POST' });
    const j = (await r.json()) as { ok: boolean; key?: string };
    setBusy(false);
    if (j.ok && j.key) {
      setKey(j.key);
      setShow(true);
      router.refresh();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <section className="card" style={{ gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 18 }}>Studio link</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            Links the Nova Studio clipping tool with this site: its <strong>schedule</strong> window posts through your YouTube and Instagram here, and the Gemini key and connections stay the same in both. Opening <a href="/studio">Studio</a> links it automatically.
          </span>
          <span className="hint" style={{ display: 'block', marginTop: 4 }}>
            Studio at <code>{studioUrl}</code> · {seenAt ? `last synced ${new Date(seenAt).toLocaleString()}` : 'not synced yet'}
          </span>
        </div>
        <span className={`chip ${seenAt || key ? 'chip-ok' : 'chip-warn'}`}>{seenAt ? 'Linked' : key ? 'Key ready' : 'Not linked'}</span>
      </div>

      {key ? (
        <div className="field">
          <span>Link key (paste it into the Studio’s schedule window)</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" readOnly type={show ? 'text' : 'password'} value={key} onFocus={(e) => e.currentTarget.select()} style={{ flex: '1 1 260px' }} />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 14 }} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 14 }} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <span className="hint">Only needed if you link by hand: in the Studio go to settings → Nova Clipping website and paste it there.</span>
        </div>
      ) : null}

      <div>
        <button type="button" className={`btn ${key ? 'btn-ghost' : 'btn-primary'}`} onClick={create} disabled={busy}>
          {busy ? 'Working…' : key ? 'Make a new key' : 'Create link key'}
        </button>
      </div>
    </section>
  );
}
