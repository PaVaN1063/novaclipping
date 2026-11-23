'use client';

import Link from 'next/link';

type Props = {
  studioUrl: string;
  youtube: string | null;
  instagram: string | null;
  gemini: boolean;
};

// The Nova Studio clipping tool, shown inside the website. It runs on the VM
// and is already linked to this site there (no keys pass through the browser).
export default function StudioClient({ studioUrl, youtube, instagram, gemini }: Props) {
  const dot = (on: boolean) => <span className="dot" style={{ background: on ? 'var(--ok)' : 'var(--warn)' }} />;
  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display">Nova Studio</h1>
          <p className="muted">Clip long gameplay, add your watermark, then schedule straight to YouTube and Instagram.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`chip ${youtube ? 'chip-yt' : ''}`}>{dot(!!youtube)} YouTube{youtube ? ` · ${youtube}` : ' · not connected'}</span>
          <span className={`chip ${instagram ? 'chip-ig' : ''}`}>{dot(!!instagram)} Instagram{instagram ? ` · ${instagram}` : ' · not connected'}</span>
          <span className={`chip ${gemini ? 'chip-ok' : ''}`}>{dot(gemini)} Gemini</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }} className="muted">
        <a className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} href={`${studioUrl}/#app`} target="_blank" rel="noreferrer">Open in new tab</a>
        <Link className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} href="/settings">Connections</Link>
      </div>

      <iframe
        src={`${studioUrl}/#app`}
        title="Nova Studio"
        allow="clipboard-read; clipboard-write; fullscreen"
        style={{ width: '100%', height: 'calc(100vh - 230px)', minHeight: 620, border: '1px solid var(--line, rgba(127,127,127,.25))', borderRadius: 16, background: 'var(--surface)' }}
      />
    </>
  );
}
