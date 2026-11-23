// Nova Clipping: schedule clips with a custom date & time for each one (or the
// same / spaced times for all), posted either through your own Nova Clipping
// website (your YouTube + Instagram) or through Upload-Post.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Calendar, CheckCircle, AlertCircle, Circle, ExternalLink, Youtube, Instagram, Link2 } from 'lucide-react';
import { apiFetch, apiJson } from '../lib/api';
import { connectUrl, inFrame, siteUrl } from '../lib/websiteLink';
import { platformOptions, defaultPlatformFlags, flagsFromList } from '../lib/socialPlatforms';
import Modal from './ui/Modal';
import SegmentedControl from './ui/SegmentedControl';
import TikTokDraftNotice from './TikTokDraftNotice';

const UP_PLATFORMS = platformOptions();
const GAPS = [
  { h: 0, label: 'same time' },
  { h: 1, label: '1 h' },
  { h: 2, label: '2 h' },
  { h: 3, label: '3 h' },
  { h: 6, label: '6 h' },
  { h: 12, label: '12 h' },
  { h: 24, label: '1 day' },
];

const pad = (n) => String(n).padStart(2, '0');
// "YYYY-MM-DDTHH:MM" in the browser's own time zone (what <input type="datetime-local"> uses)
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

function nextHour(hoursAhead = 1) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + hoursAhead);
  return d;
}

function clipTitle(c) {
  return c?.video_title_for_youtube_short || c?.title || 'Viral Short';
}
function clipDescription(c) {
  return c?.video_description_for_instagram || c?.video_description_for_tiktok || c?.video_description_for_youtube || '';
}

export default function ScheduleModal({ isOpen, onClose, clips, jobId, uploadPostKey, uploadUserId, isManaged }) {
  const [via, setVia] = useState('nova');
  const [mode, setMode] = useState('schedule'); // nova only: schedule | draft
  const [rows, setRows] = useState([]);
  const [bulkStart, setBulkStart] = useState(toLocalInput(nextHour(1)));
  const [bulkGap, setBulkGap] = useState(3);
  const [novaPlatforms, setNovaPlatforms] = useState({ youtube: true, instagram: false });
  const [upPlatforms, setUpPlatforms] = useState(defaultPlatformFlags);
  const [link, setLink] = useState({ loading: true, site_url: '', has_key: false });
  const [linkKey, setLinkKey] = useState('');
  const [linkMsg, setLinkMsg] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState({}); // index -> {ok, error}
  const [done, setDone] = useState(null); // {ok, text, url}

  // Fresh rows each time the window opens.
  useEffect(() => {
    if (!isOpen) return;
    const start = nextHour(1);
    setRows((clips || []).map((c, i) => ({
      index: i,
      on: true,
      title: clipTitle(c).slice(0, 100),
      description: clipDescription(c),
      when: toLocalInput(new Date(start.getTime() + i * 3 * 3600_000)),
    })));
    setResults({});
    setDone(null);
    setBusy(false);
    setBulkStart(toLocalInput(start));
    apiJson('/api/nova/publish/settings')
      .then((s) => {
        setLink({ loading: false, ...s });
        // Default to your own website when it's linked, else Upload-Post if that has a key.
        setVia(s.has_key ? 'nova' : (uploadPostKey && uploadUserId) || isManaged ? 'uploadpost' : 'nova');
      })
      .catch(() => setLink({ loading: false, site_url: '', has_key: false }));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => rows.filter((r) => r.on), [rows]);
  const novaPicked = Object.keys(novaPlatforms).filter((k) => novaPlatforms[k]);
  const upPicked = Object.keys(upPlatforms).filter((k) => upPlatforms[k]);
  const canUploadPost = isManaged || (uploadPostKey && uploadUserId);
  const isDraft = via === 'nova' && mode === 'draft';
  const nowMs = Date.now();
  const badTimes = isDraft ? [] : selected.filter((r) => !r.when || isNaN(new Date(r.when).getTime()) || new Date(r.when).getTime() < nowMs + 60_000);

  if (!isOpen) return null;

  const setRow = (i, patch) => setRows((cur) => cur.map((r) => (r.index === i ? { ...r, ...patch } : r)));

  const applyBulk = () => {
    const base = new Date(bulkStart).getTime();
    if (isNaN(base)) return;
    let k = 0;
    setRows((cur) => cur.map((r) => {
      if (!r.on) return r;
      const when = toLocalInput(new Date(base + k * bulkGap * 3600_000));
      k += 1;
      return { ...r, when };
    }));
  };

  const saveLink = async () => {
    setLinkBusy(true);
    setLinkMsg(null);
    try {
      const saved = await apiJson('/api/nova/publish/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_url: link.site_url, key: linkKey || undefined }),
      });
      setLink((l) => ({ ...l, ...saved }));
      const t = await apiJson('/api/nova/publish/test', { method: 'POST' });
      const yt = t.youtube?.connected ? `YouTube ${t.youtube.account || ''}` : 'YouTube not connected';
      const ig = t.instagram?.connected ? `Instagram ${t.instagram.account || ''}` : 'Instagram not connected';
      setLinkMsg({ ok: true, text: `Linked. ${yt} · ${ig}` });
      setLinkKey('');
    } catch (e) {
      setLinkMsg({ ok: false, text: e.message || 'Could not link the website.' });
    } finally {
      setLinkBusy(false);
    }
  };

  const sendNova = async () => {
    const payload = {
      job_id: jobId,
      mode,
      platforms: novaPicked,
      watermark: localStorage.getItem('nova_wm_on') !== '0',
      clips: selected.map((r) => ({
        clip_index: r.index,
        title: r.title.trim() || 'Viral Short',
        description: r.description || '',
        publish_at: mode === 'schedule' ? new Date(r.when).toISOString() : null,
      })),
    };
    const res = await apiFetch('/api/nova/publish/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) throw new Error(data.detail || text || `HTTP ${res.status}`);
    const r = {};
    selected.forEach((s) => { r[s.index] = { ok: true }; });
    setResults(r);
    setDone({
      ok: true,
      text: `${data.count} ${data.count === 1 ? 'clip' : 'clips'} sent to Nova Clipping — ${mode === 'draft' ? 'saved as drafts' : 'scheduled'}.`,
      url: data.batch_url,
    });
  };

  const sendUploadPost = async () => {
    const tz = browserTz();
    const out = {};
    for (const r of selected) {
      const scheduled = r.when.length === 16 ? `${r.when}:00` : r.when;
      try {
        const res = await apiFetch('/api/social/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            clip_index: r.index,
            api_key: uploadPostKey,
            user_id: uploadUserId,
            platforms: upPicked,
            title: r.title.trim() || 'Viral Short',
            description: r.description || '',
            scheduled_date: scheduled,
            timezone: tz,
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          let d = t;
          try { d = JSON.parse(t).detail || t; } catch { /* not json */ }
          throw new Error(d);
        }
        out[r.index] = { ok: true };
      } catch (e) {
        out[r.index] = { ok: false, error: e.message };
      }
      setResults({ ...out });
    }
    const fails = Object.values(out).filter((x) => !x.ok).length;
    setDone({
      ok: fails === 0,
      text: fails === 0 ? 'All clips scheduled on Upload-Post.' : `${selected.length - fails} scheduled, ${fails} failed.`,
      url: 'https://app.upload-post.com/calendar',
    });
  };

  const send = async () => {
    setBusy(true);
    setDone(null);
    try {
      if (via === 'nova') await sendNova();
      else await sendUploadPost();
    } catch (e) {
      setDone({ ok: false, text: e.message || 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const ready =
    selected.length > 0 &&
    badTimes.length === 0 &&
    (via === 'nova' ? link.has_key && novaPicked.length > 0 : canUploadPost && upPicked.length > 0);

  const footer = (
    <div className="flex flex-col sm:flex-row gap-3">
      <button onClick={onClose} disabled={busy} className="btn-ghost flex-1">{done?.ok ? 'close' : 'cancel'}</button>
      {done?.ok && done.url ? (
        <a href={done.url} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1 no-underline">
          <ExternalLink size={16} />
          {via === 'nova' ? 'open in nova clipping' : 'view calendar'}
        </a>
      ) : (
        <button onClick={send} disabled={busy || !ready} className="btn-primary flex-1">
          {busy ? <><Loader2 size={16} className="animate-spin" />sending…</> : (
            <><Calendar size={16} />{isDraft ? `save ${selected.length} as drafts` : `schedule ${selected.length} ${selected.length === 1 ? 'clip' : 'clips'}`}</>
          )}
        </button>
      )}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={busy ? undefined : onClose} eyebrow="PUBLISH" title="schedule" size="lg" footer={footer}>
      {/* How to post */}
      <div className="mb-5">
        <label className="eyebrow block mb-2">post through</label>
        <SegmentedControl
          options={[
            { value: 'nova', label: 'nova clipping (my youtube)', disabled: busy },
            { value: 'uploadpost', label: 'upload-post', disabled: busy },
          ]}
          value={via}
          onChange={setVia}
        />
      </div>

      {via === 'nova' && !link.loading && (
        <div className="mb-5 space-y-3">
          {!link.has_key || linkMsg ? (
            <div className="p-3 rounded-input bg-paper3 space-y-3">
              <p className="text-xs text-ink2 flex items-start gap-2">
                <Link2 size={14} className="mt-0.5 shrink-0 text-brass" />
                <span>
                  Link your Nova Clipping website (it posts with your own YouTube / Instagram connection). Copy the
                  <strong> link key</strong> from the website’s <strong>Settings → Studio link</strong>.
                </span>
              </p>
              <button className="btn-primary px-3 py-2 text-xs" onClick={() => {
                if (inFrame) { window.top.location.href = `${siteUrl()}/studio`; return; }
                window.location.href = connectUrl();
              }}>connect with website (one click)</button>
              <p className="readout">or paste the address and link key:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className="input-field" value={link.site_url} placeholder="http://localhost:3000"
                  onChange={(e) => setLink((l) => ({ ...l, site_url: e.target.value }))} />
                <input className="input-field" type="password" value={linkKey} placeholder={link.has_key ? 'key saved — paste to replace' : 'paste link key'}
                  onChange={(e) => setLinkKey(e.target.value)} autoComplete="off" />
              </div>
              <button className="btn-ghost px-3 py-2 text-xs" onClick={saveLink} disabled={linkBusy || (!linkKey && !link.has_key)}>
                {linkBusy ? <Loader2 size={14} className="animate-spin" /> : null} save & test
              </button>
              {linkMsg && <p className={`text-xs ${linkMsg.ok ? 'text-ok' : 'text-danger'}`}>{linkMsg.text}</p>}
            </div>
          ) : (
            <p className="text-xs text-ok flex items-center gap-2">
              <CheckCircle size={14} /> Linked to {link.site_url.replace('host.docker.internal', 'localhost')}
              <button className="underline text-muted ml-2" onClick={() => setLinkMsg({ ok: true, text: 'Paste a new key to change it.' })}>change</button>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="eyebrow block mb-2">platforms</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setNovaPlatforms((p) => ({ ...p, youtube: !p.youtube }))}
                  className={`btn-quiet px-3 py-2 text-xs ${novaPlatforms.youtube ? 'ring-1 ring-brass text-brass' : ''}`} aria-pressed={novaPlatforms.youtube}>
                  <Youtube size={14} /> youtube
                </button>
                <button type="button" onClick={() => setNovaPlatforms((p) => ({ ...p, instagram: !p.instagram }))}
                  className={`btn-quiet px-3 py-2 text-xs ${novaPlatforms.instagram ? 'ring-1 ring-brass text-brass' : ''}`} aria-pressed={novaPlatforms.instagram}>
                  <Instagram size={14} /> instagram
                </button>
              </div>
            </div>
            <div>
              <label className="eyebrow block mb-2">when</label>
              <SegmentedControl
                options={[{ value: 'schedule', label: 'schedule' }, { value: 'draft', label: 'save as draft' }]}
                value={mode}
                onChange={setMode}
              />
            </div>
          </div>
        </div>
      )}

      {via === 'uploadpost' && (
        <div className="mb-5">
          {!canUploadPost && (
            <div className="mb-3 p-3 bg-warn/10 text-warn text-xs rounded-input flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div>Set your Upload-Post API key in Settings first.</div>
            </div>
          )}
          <label className="eyebrow block mb-2">platforms</label>
          <SegmentedControl
            multi
            options={UP_PLATFORMS.map((o) => ({ ...o, disabled: busy }))}
            value={upPicked}
            onChange={(arr) => setUpPlatforms(flagsFromList(arr))}
          />
          {upPlatforms.tiktok && !busy && <div className="mt-3"><TikTokDraftNotice /></div>}
        </div>
      )}

      {/* Set all at once */}
      {!isDraft && (
        <div className="mb-4 p-3 rounded-input bg-paper3">
          <label className="eyebrow block mb-2">set all selected clips</label>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <span className="readout block mb-1">first one at</span>
              <input type="datetime-local" className="input-field [color-scheme:dark]" value={bulkStart}
                onChange={(e) => setBulkStart(e.target.value)} disabled={busy} />
            </div>
            <div>
              <span className="readout block mb-1">then every</span>
              <select className="input-field appearance-none cursor-pointer" value={bulkGap} onChange={(e) => setBulkGap(Number(e.target.value))} disabled={busy}>
                {GAPS.map((g) => <option key={g.h} value={g.h}>{g.label}</option>)}
              </select>
            </div>
            <button className="btn-ghost px-3 py-2 text-xs" onClick={applyBulk} disabled={busy}>apply to all</button>
          </div>
          <p className="readout mt-2">times are in your time zone ({browserTz()}). Change any clip below on its own.</p>
        </div>
      )}

      {/* Clips, each with its own date & time */}
      <div className="border-y border-rule divide-y divide-rule max-h-[42vh] overflow-y-auto custom-scrollbar">
        {rows.map((r) => {
          const res = results[r.index];
          const late = !isDraft && r.on && (!r.when || new Date(r.when).getTime() < nowMs + 60_000);
          return (
            <div key={r.index} className="flex flex-wrap items-center gap-3 py-2.5">
              <input type="checkbox" checked={r.on} disabled={busy} onChange={(e) => setRow(r.index, { on: e.target.checked })}
                aria-label={`Include clip ${r.index + 1}`} className="w-4 h-4 accent-[var(--brass,#c9a227)]" />
              <span className="readout w-6">{r.index + 1}</span>
              <input className="input-field flex-1 min-w-[180px] text-xs" value={r.title} maxLength={100} disabled={busy || !r.on}
                onChange={(e) => setRow(r.index, { title: e.target.value })} aria-label={`Title of clip ${r.index + 1}`} />
              {!isDraft && (
                <input type="datetime-local" className={`input-field w-[210px] text-xs [color-scheme:dark] ${late ? 'ring-1 ring-danger' : ''}`}
                  value={r.when} disabled={busy || !r.on} onChange={(e) => setRow(r.index, { when: e.target.value })}
                  aria-label={`Date and time of clip ${r.index + 1}`} />
              )}
              <span className="w-5 shrink-0">
                {res?.ok === true && <CheckCircle size={16} className="text-ok" />}
                {res?.ok === false && <AlertCircle size={16} className="text-danger" title={res.error} />}
                {busy && !res && r.on && <Loader2 size={16} className="text-brass animate-spin" />}
                {!busy && !res && <Circle size={16} className="text-muted" />}
              </span>
              {res?.ok === false && <p className="w-full text-xs text-danger pl-12">{res.error}</p>}
            </div>
          );
        })}
      </div>

      {badTimes.length > 0 && (
        <p className="mt-3 text-xs text-danger">Pick a time in the future for {badTimes.length === 1 ? 'the highlighted clip' : `${badTimes.length} highlighted clips`}.</p>
      )}
      {done && (
        <p className={`mt-3 text-xs ${done.ok ? 'text-ok' : 'text-danger'}`}>{done.text}</p>
      )}
    </Modal>
  );
}
