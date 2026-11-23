import { useEffect, useState } from 'react';
import { Stamp, Check, Loader2 } from 'lucide-react';
import { getWmSettings, saveWmSettings, WM_EVENT } from '../lib/novaWatermark';

// Nova Clipping: the text (e.g. your channel name) that goes on clips when
// "watermark" is on at download. Saved on the server (nova_watermark.py), so
// every device that opens the site uses the same text and placement.
const POSITIONS = [
  { id: 'top-center', label: 'top' },
  { id: 'center', label: 'middle' },
  { id: 'bottom-center', label: 'bottom' },
  { id: 'top-left', label: '↖' },
  { id: 'top-right', label: '↗' },
  { id: 'bottom-left', label: '↙' },
  { id: 'bottom-right', label: '↘' },
];

// Where the text sits on the 9:16 preview, mirroring the ffmpeg overlay.
const PREVIEW_STYLE = {
  'top-center': { top: '15%', left: '50%', transform: 'translate(-50%, -50%)' },
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'bottom-center': { top: '85%', left: '50%', transform: 'translate(-50%, -50%)' },
  'top-left': { top: '4%', left: '4%' },
  'top-right': { top: '4%', right: '4%' },
  'bottom-left': { bottom: '4%', left: '4%' },
  'bottom-right': { bottom: '4%', right: '4%' },
};

const PREVIEW_W = 144; // px, the preview frame width (w-36)

export default function NovaWatermarkCard() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getWmSettings(true).then(setS).catch(() => setError('Could not reach the backend for watermark settings.'));
    const onChange = (e) => setS((cur) => ({ ...cur, ...e.detail }));
    window.addEventListener(WM_EVENT, onChange);
    return () => window.removeEventListener(WM_EVENT, onChange);
  }, []);

  const update = (patch) => { setSaved(false); setS((cur) => ({ ...cur, ...patch })); };

  const save = async () => {
    setBusy(true); setError('');
    try {
      await saveWmSettings({ text: s.text, position: s.position, size: s.size, opacity: s.opacity });
      setSaved(true);
    } catch (e) {
      setError(e?.detail || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-input bg-paper3 flex items-center justify-center shrink-0">
          <Stamp size={16} className="text-brass" />
        </div>
        <div>
          <h2 className="text-base font-medium text-ink lowercase">watermark</h2>
          <p className="text-xs text-muted">Your text (e.g. your YouTube channel) goes on a clip when “watermark” is on at download.</p>
        </div>
      </div>

      {!s ? (
        <p className="text-sm text-muted">{error || 'loading…'}</p>
      ) : (
        <div className="grid sm:grid-cols-[9rem_1fr] gap-6">
          {/* Live preview on a 9:16 frame */}
          <div className="relative aspect-[9/16] w-36 rounded-card overflow-hidden border border-rule bg-gradient-to-b from-paper3 to-paper mx-auto sm:mx-0">
            {s.text?.trim() && (
              <span
                className="absolute whitespace-nowrap text-white font-extrabold"
                style={{
                  ...PREVIEW_STYLE[s.position],
                  fontFamily: 'Montserrat, var(--font-body)',
                  fontSize: `${Math.max(5, PREVIEW_W * s.size)}px`,
                  opacity: s.opacity,
                  textShadow: '0 0 3px rgba(0,0,0,.35)',
                }}
              >
                {s.text}
              </span>
            )}
            <span className="absolute left-1/2 -translate-x-1/2 top-[24%] bg-white text-black text-[7px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap">
              captions here
            </span>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="readout">TEXT</span>
              <input
                type="text"
                value={s.text || ''}
                maxLength={60}
                placeholder="@yourchannel"
                onChange={(e) => update({ text: e.target.value })}
                className="mt-2 w-full bg-paper border border-rule rounded-input px-3 py-2 text-sm text-ink focus:outline-none focus:border-brass"
              />
            </label>

            <div>
              <p className="readout mb-2">POSITION</p>
              <div className="flex flex-wrap gap-1.5">
                {POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.id.replace('-', ' ')}
                    onClick={() => update({ position: p.id })}
                    className={`min-w-9 h-9 px-2 rounded-input border text-xs lowercase transition-colors ${s.position === p.id ? 'border-brass text-brass bg-brass/10' : 'border-rule text-muted hover:text-ink2'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="readout">SIZE · {Math.round(s.size * 1000) / 10}%</span>
              <input type="range" min="0.025" max="0.09" step="0.0025" value={s.size}
                onChange={(e) => update({ size: Number(e.target.value) })}
                className="w-full mt-2 accent-[var(--color-accent)]" />
            </label>

            <label className="block">
              <span className="readout">OPACITY · {Math.round(s.opacity * 100)}%</span>
              <input type="range" min="0.2" max="1" step="0.05" value={s.opacity}
                onChange={(e) => update({ opacity: Number(e.target.value) })}
                className="w-full mt-2 accent-[var(--color-accent)]" />
            </label>

            <div className="flex items-center gap-3">
              <button type="button" disabled={busy} onClick={save} className="btn-primary px-4 py-2 text-sm">
                {busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
                {saved ? 'saved' : 'save'}
              </button>
              {error && <span className="text-xs text-danger">{error}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
