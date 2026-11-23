import { useEffect, useState } from 'react';
import { Globe, Loader2, CheckCircle, AlertTriangle, ExternalLink, RefreshCw, Unlink } from 'lucide-react';
import { LINK_EVENT, readState, loadStatus, sync, connect, unlink, connectUrl, openSite, siteUrl, inFrame } from '../lib/websiteLink';

// Nova Clipping: Settings card for the link with the Nova Clipping website.
// Shows what is connected on the website (YouTube, Instagram, Gemini) and
// links with one click.
function Row({ ok, label, value, onFix }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-rule last:border-0">
      <span className="flex items-center gap-2 text-sm text-ink2">
        {ok ? <CheckCircle size={14} className="text-ok" /> : <AlertTriangle size={14} className="text-warn" />}
        {label}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted truncate">
        {value}
        {!ok && onFix && <button className="underline" onClick={onFix}>connect on website</button>}
      </span>
    </div>
  );
}

export default function WebsiteLinkCard() {
  const [st, setSt] = useState(readState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState(false);
  const [site, setSite] = useState(siteUrl());
  const [key, setKey] = useState('');

  useEffect(() => {
    const on = (e) => setSt(e.detail);
    window.addEventListener(LINK_EVENT, on);
    loadStatus().then((s) => (s.has_key ? sync() : null)).catch(() => {});
    return () => window.removeEventListener(LINK_EVENT, on);
  }, []);

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e?.message || 'Something went wrong.'); }
    setBusy(false);
  };

  const linked = !!st?.has_key;
  const w = st?.site || {};
  const goConnect = () => {
    if (inFrame) { window.top.location.href = `${siteUrl()}/studio`; return; }
    window.location.href = connectUrl();
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-input bg-paper3 flex items-center justify-center shrink-0">
            <Globe size={16} className="text-brass" />
          </div>
          <div>
            <h2 className="text-base font-medium text-ink lowercase">nova clipping website</h2>
            <p className="text-xs text-muted">posting, YouTube, Instagram and the Gemini key are shared with the website</p>
          </div>
        </div>
        <span className={linked && st?.online !== false && !st?.refused ? 'badge-ok' : 'badge-warn'}>
          {!linked ? 'not linked' : st?.refused ? 'relink' : st?.online === false ? 'offline' : 'linked'}
        </span>
      </div>

      {linked ? (
        <>
          {st?.error && <p className="text-xs text-danger mb-3">{st.error}</p>}
          <div className="mb-4">
            <Row ok={!!w.youtube?.connected} label="YouTube" value={w.youtube?.connected ? (w.youtube.account || 'connected') : 'not connected'} onFix={() => openSite('/settings')} />
            <Row ok={!!w.instagram?.connected} label="Instagram" value={w.instagram?.connected ? (w.instagram.account || 'connected') : 'not connected'} onFix={() => openSite('/settings#instagram')} />
            <Row ok={!!w.gemini?.set} label="Gemini key" value={w.gemini?.set ? 'same key in both' : 'not set'} />
            <Row ok label="Website" value={st.site_url} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost px-3 py-2 text-xs" onClick={() => openSite('/dashboard')}><ExternalLink size={14} /> open website</button>
            <button className="btn-ghost px-3 py-2 text-xs" onClick={() => run(sync)} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} sync now
            </button>
            {st?.refused && <button className="btn-primary px-3 py-2 text-xs" onClick={goConnect}>connect again</button>}
            <button className="btn-quiet px-3 py-2 text-xs" onClick={() => run(unlink)} disabled={busy}><Unlink size={14} /> unlink</button>
          </div>
          {st?.checkedAt && <p className="readout mt-3">synced {new Date(st.checkedAt).toLocaleTimeString()}</p>}
        </>
      ) : (
        <>
          <p className="text-xs text-ink2 mb-4 leading-relaxed">
            Link once and the Studio’s <strong>schedule</strong> window posts through your own YouTube and Instagram on the website.
            The website must be running (<code>start-dev.bat</code>) and you must be signed in there.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button className="btn-primary px-4 py-2 text-sm" onClick={goConnect}><Globe size={14} /> connect with website</button>
            <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setManual((m) => !m)}>paste a key instead</button>
          </div>
          {manual && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className="input-field" value={site} onChange={(e) => setSite(e.target.value)} placeholder="http://localhost:3000" />
              <input className="input-field" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="link key (website → settings → studio link)" autoComplete="off" />
              <button className="btn-ghost px-3 py-2 text-xs sm:col-span-2" disabled={busy || !key} onClick={() => run(() => connect(site.trim(), key.trim()))}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} link
              </button>
            </div>
          )}
        </>
      )}
      {err && <p className="text-xs text-danger mt-3">{err}</p>}
    </div>
  );
}
