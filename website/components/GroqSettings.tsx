'use client';

import { useEffect, useState } from 'react';

type Status = { set: boolean; valid?: boolean | null; reason?: string; chat?: number; whisper?: boolean; savedAt?: string };

// Groq: free backup when Gemini is busy, and fast listening (Whisper).
export default function GroqSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await fetch('/api/settings/groq', { cache: 'no-store' });
    setSt((await r.json().catch(() => ({ set: false }))) as Status);
  }
  useEffect(() => { load(); }, []);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/settings/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    setKey('');
    setMsg(j.ok ? { ok: true, text: done } : { ok: false, text: j.error || 'Could not save.' });
    load();
  }

  const chip = st === null ? ['chip-warn', 'Checking…']
    : !st.set ? ['chip-warn', 'Not set']
    : st.valid === true ? ['chip-ok', 'Working']
    : st.valid === false ? ['chip-danger', 'Key not valid']
    : ['chip-warn', 'Saved · not checked'];

  return (
    <section className="card" style={{ gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 18 }}>Groq (free backup AI + fast listening)</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            When Gemini is busy, finding moments switches to Groq instead of failing. Groq also turns speech into text in seconds instead of minutes on the VM.
          </span>
        </div>
        <span className={`chip ${chip[0]}`}>{chip[1]}</span>
      </div>
      {st?.set && st.valid ? (
        <span className="hint">{st.chat} AI models available{st.whisper ? ' · Whisper listening on' : ''} · saved {st.savedAt ? new Date(st.savedAt).toLocaleString() : ''}</span>
      ) : st?.set && st.reason ? <span className="hint">{st.reason}</span> : null}
      <label className="field"><span>Groq API key {st?.set ? '(saved — type to replace)' : ''}</span>
        <input className="input" type="password" autoComplete="off" placeholder="gsk_…" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <span className="hint">Free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>. Kept on your VM only.</span>
      {msg ? <p className={msg.ok ? 'hint' : 'error'}>{msg.text}</p> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={busy || !key.trim()} onClick={() => send({ key }, 'Saved and checked with Groq.')}>Save key</button>
        <button type="button" className="btn btn-ghost" disabled={busy || !st?.set} onClick={() => load().then(() => setMsg({ ok: true, text: 'Checked.' }))}>Check again</button>
        <button type="button" className="btn btn-ghost" disabled={busy || !st?.set} onClick={() => send({ remove: true }, 'Removed.')}>Remove</button>
      </div>
    </section>
  );
}
