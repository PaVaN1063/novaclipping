'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PlatformIcon from './PlatformIcon';
import { PLATFORM_LIST, isPlatform, type Platform } from '@/lib/platforms';

type Props = {
  enabled: boolean;
  platforms: string[];
  mode: 'draft' | 'schedule';
  gapHours: number;
  caption: string;
  deleteAfterPost: boolean;
  inbox: string;
  aiReady: boolean;
};

const GAPS = [1, 2, 3, 6, 12, 24];

export default function AutopilotSettings(p: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(p.enabled);
  const [picked, setPicked] = useState<Platform[]>(p.platforms.filter(isPlatform));
  const toggle = (id: Platform) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const [mode, setMode] = useState(p.mode);
  const [gap, setGap] = useState(p.gapHours);
  const [caption, setCaption] = useState(p.caption);
  const [del, setDel] = useState(p.deleteAfterPost);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/settings/autopilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        platforms: picked,
        mode,
        gapHours: gap,
        caption,
        deleteAfterPost: del,
      }),
    });
    const j = (await r.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (!j.ok) return setMsg({ text: j.error || 'Could not save.', ok: false });
    setMsg({ text: enabled ? 'Autopilot is on. Drop videos into the inbox folder.' : 'Saved.', ok: true });
    router.refresh();
  }

  return (
    <section className="card" style={{ gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 18 }}>Autopilot</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            Drop videos into the inbox folder and walk away. Nova picks them up, the AI writes and scores each one, and the best clips get the earliest slots.
          </span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
          <span style={{ fontWeight: 600, color: 'var(--heading)' }}>{enabled ? 'On' : 'Off'}</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
        </label>
      </div>

      <div className="field">
        <span>Inbox folder</span>
        <code className="notice" style={{ fontSize: 13, wordBreak: 'break-all' }}>{p.inbox}</code>
        <span className="hint">Copy or save finished clips here (later, the Studio clipping tool will drop its clips here by itself). Originals are moved to the “done” folder inside it.</span>
      </div>

      {!p.aiReady ? <p className="error" style={{ fontSize: 14 }}>Add your Gemini key above — without it, Autopilot uses file names as titles and can’t rank clips.</p> : null}

      <div className="field">
        <span>Post to</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {PLATFORM_LIST.map((pl) => (
            <button key={pl.id} type="button" className={`toggle-btn ${pl.tone}`} aria-pressed={picked.includes(pl.id)} onClick={() => toggle(pl.id)}>
              <PlatformIcon id={pl.id} /> {pl.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>When</span>
        <div className="seg" role="radiogroup" aria-label="Autopilot posting">
          <button type="button" role="radio" aria-checked={mode === 'draft'} onClick={() => setMode('draft')}>Save as drafts</button>
          <button type="button" role="radio" aria-checked={mode === 'schedule'} onClick={() => setMode('schedule')}>Schedule automatically</button>
        </div>
      </div>

      {mode === 'schedule' ? (
        <div className="field">
          <span>One clip every</span>
          <div className="gap-grid">
            {GAPS.map((h) => (
              <button key={h} type="button" aria-pressed={gap === h} onClick={() => setGap(h)}>{h === 24 ? '1 day' : `${h} h`}</button>
            ))}
          </div>
          <span className="hint">New clips go into the next free slots after everything already scheduled.</span>
        </div>
      ) : null}

      <label className="field">
        <span>Extra text under every description (optional)</span>
        <textarea className="textarea" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Follow @theclipdose.official for daily clips" />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
        <span className="body" style={{ fontSize: 14 }}>Delete Nova’s copy of a video once it’s posted everywhere (saves disk space — recommended on a server)</span>
        <input type="checkbox" checked={del} onChange={(e) => setDel(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--accent)', flex: 'none' }} />
      </label>

      {msg ? <p className={msg.ok ? 'hint' : 'error'} role="status" style={msg.ok ? { color: 'var(--ok)' } : undefined}>{msg.text}</p> : null}
      <div><button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Autopilot'}</button></div>
    </section>
  );
}
