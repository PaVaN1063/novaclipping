'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Gmail that sends Nova Clipping's emails (posted, confirm, storage full).
export default function MailSettings({ user, hasPassword }: { user: string; hasPassword: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(user || 'cocopupstv@gmail.com');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/settings/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    setPass('');
    setMsg(j.ok ? { ok: true, text: done } : { ok: false, text: j.error || 'Could not save.' });
    router.refresh();
  }

  return (
    <section className="card" style={{ gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 18 }}>Email alerts</h2>
          <span className="muted" style={{ fontSize: 14 }}>Sent from this Gmail to both your addresses: auto-posted clips, clips to confirm, storage full.</span>
        </div>
        <span className={`chip ${hasPassword ? 'chip-ok' : 'chip-warn'}`}>{hasPassword ? 'On' : 'Needs an app password'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <label className="field"><span>Gmail address</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field"><span>App password {hasPassword ? '(saved — type to replace)' : ''}</span>
          <input className="input" type="password" autoComplete="off" placeholder="16 letters" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
      </div>
      <span className="hint">
        Make one at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a> (needs 2-Step Verification). It’s kept on your VM only.
      </span>
      {msg ? <p className={msg.ok ? 'hint' : 'error'}>{msg.text}</p> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send({ user: email, appPassword: pass }, 'Saved.')}>Save</button>
        <button type="button" className="btn btn-ghost" disabled={busy || !hasPassword} onClick={() => send({ test: true }, 'Test email sent to both addresses.')}>Send a test email</button>
      </div>
    </section>
  );
}
