'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = { autoPost: boolean; platforms: string[]; gapHours: number; maxParallel: number; storageLimitGb: number };

// How the Studio handles new clips by their viral score.
export default function AutomationSettings(p: Props) {
  const router = useRouter();
  const [v, setV] = useState(p);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (pl: string) => setV((x) => ({ ...x, platforms: x.platforms.includes(pl) ? x.platforms.filter((y) => y !== pl) : [...x.platforms, pl] }));

  async function save() {
    setBusy(true);
    const r = await fetch('/api/settings/automation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    setMsg(j.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: j.error || 'Could not save.' });
    router.refresh();
  }

  return (
    <section className="card" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18 }}>Studio automation</h2>
        <span className="muted" style={{ fontSize: 14 }}>What happens to new clips, by viral score.</span>
      </div>
      <ul className="body" style={{ margin: 0, paddingLeft: 20, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li><strong>90+</strong> — {v.autoPost ? 'posted by itself at the next free slot, then you get an email' : 'asks you to confirm'}</li>
        <li><strong>70–89</strong> — asks you to confirm (one tap), with an email</li>
        <li><strong>50–69</strong> — waits for your approval</li>
        <li><strong>Under 50</strong> — on hold, never posted</li>
        <li>Not posted in 7 days → on hold. Posted → files deleted 7 days later (a record stays). Every 3 days you’re asked to clear old posted clips.</li>
      </ul>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}>
        <input type="checkbox" checked={v.autoPost} onChange={(e) => setV({ ...v, autoPost: e.target.checked })} />
        Post 90+ clips automatically
      </label>
      <div className="field">
        <span>Post to</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {['youtube', 'instagram'].map((pl) => (
            <button key={pl} type="button" className={`toggle-btn ${pl === 'youtube' ? 'yt' : 'ig'}`} aria-pressed={v.platforms.includes(pl)} onClick={() => toggle(pl)}>
              {pl === 'youtube' ? 'YouTube' : 'Instagram'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <label className="field"><span>Time between posts</span>
          <select className="select" value={v.gapHours} onChange={(e) => setV({ ...v, gapHours: Number(e.target.value) })}>
            {[1, 2, 3, 4, 6, 12, 24].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label className="field"><span>Projects at the same time</span>
          <select className="select" value={v.maxParallel} onChange={(e) => setV({ ...v, maxParallel: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="field"><span>Storage limit (GB)</span>
          <input className="input" type="number" min={10} max={145} value={v.storageLimitGb} onChange={(e) => setV({ ...v, storageLimitGb: Number(e.target.value) })} />
        </label>
      </div>
      {msg ? <p className={msg.ok ? 'hint' : 'error'}>{msg.text}</p> : null}
      <div><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
    </section>
  );
}
