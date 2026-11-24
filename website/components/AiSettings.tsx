'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

export default function AiSettings({ hasKey, model: savedModel }: { hasKey: boolean; model: string }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(savedModel);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [check, setCheck] = useState<{ valid?: boolean | null; answering?: string; ms?: number; models?: string[]; reason?: string } | null>(null);
  const runCheck = () => { setCheck(null); fetch('/api/settings/ai', { cache: 'no-store' }).then((r) => r.json()).then(setCheck).catch(() => setCheck({ valid: null, reason: 'Could not check.' })); };
  useEffect(() => { if (hasKey) runCheck(); }, [hasKey]);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/settings/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (!j.ok) return setMsg({ text: j.error || 'Could not save.', ok: false });
    setApiKey('');
    setMsg({ text: done, ok: true });
    router.refresh();
  }

  function save(e: FormEvent) {
    e.preventDefault();
    send({ apiKey, model }, 'Saved. New batches will get AI titles, descriptions and hashtags.');
  }

  return (
    <section className="card" style={{ gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ fontSize: 18 }}>AI writer (Gemini)</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            Watches each clip and writes the title, description, hashtags and tags before it’s uploaded.
          </span>
        </div>
        <span className={`chip ${!hasKey ? 'chip-warn' : check?.valid === false ? 'chip-danger' : check?.answering === 'yes' ? 'chip-ok' : 'chip-warn'}`}>
          {!hasKey ? 'Needs a key' : !check ? 'Checking…' : check.valid === false ? 'Key not valid' : check.answering === 'yes' ? `Working · ${((check.ms || 0) / 1000).toFixed(1)}s` : check.answering === 'busy' ? 'Key OK · Gemini busy now' : check.answering === 'slow' ? 'Key OK · Gemini very slow now' : 'Saved'}
        </span>
        {hasKey ? <button type="button" className="btn btn-ghost" style={{ minHeight: 30, fontSize: 12 }} onClick={runCheck}>Check</button> : null}
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          <span>Gemini API key</span>
          <input
            className="input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? 'Saved — leave empty to keep it' : 'Paste your key from Google AI Studio'}
            autoComplete="off"
            required={!hasKey}
          />
          <span className="hint">
            Get a free key at{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. Kept only on this computer.
          </span>
        </label>
        <label className="field">
          <span>Model (optional)</span>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Leave empty to use the latest Gemini Flash" autoComplete="off" />
        </label>
        {msg ? <p className={msg.ok ? 'hint' : 'error'} role="status" style={msg.ok ? { color: 'var(--ok)' } : undefined}>{msg.text}</p> : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          {hasKey ? (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => send({ remove: true }, 'Key removed. AI is off.')}>Remove key</button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
