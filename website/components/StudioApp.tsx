'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JobDetails, { DetailsToggle } from './JobDetails';

type Status = 'confirm' | 'approval' | 'ready' | 'scheduled' | 'posted' | 'on_hold' | 'deleted';
type Clip = {
  id: string; projectId: string; title: string; description: string; hashtags: string[];
  duration: number | null; viralScore: number; currentScore: number; status: Status;
  createdAt: string; scheduledFor: string | null; postedAt: string | null; postedTo: string[]; autoPosted: boolean;
  preview: string | null; download: string | null; original: string | null;
};
type Job = {
  id: string; projectId: string; status: 'waiting' | 'sending' | 'clipping' | 'done' | 'failed';
  progress: number; stage: string | null; error: string | null; clipCount: number; createdAt: string;
  source: { kind: 'url'; url: string } | { kind: 'file'; fileName: string };
};
type Project = { id: string; name: string; createdAt: string };
type State = {
  projects: Project[]; jobs: Job[]; library: Clip[];
  settings: { autoPost: boolean; platforms: string[]; gapHours: number; maxParallel: number; storageLimitGb: number; storageFull: boolean };
  connected: Record<string, boolean>; gemini: boolean; mail: boolean;
  storage: { usedBytes: number; limitBytes: number } | null;
  reminder: string[];
};
type Toast = { id: number; text: string; tone?: 'ok' | 'warn' };

const TABS: { key: string; label: string; statuses: Status[] }[] = [
  { key: 'needs', label: 'Needs you', statuses: ['confirm', 'approval'] },
  { key: 'ready', label: 'Ready to post', statuses: ['ready'] },
  { key: 'scheduled', label: 'Scheduled', statuses: ['scheduled'] },
  { key: 'posted', label: 'Posted', statuses: ['posted'] },
  { key: 'hold', label: 'On hold', statuses: ['on_hold'] },
  { key: 'deleted', label: 'Deleted', statuses: ['deleted'] },
];

const GB = 1024 ** 3;
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const tone = (n: number) => (n >= 90 ? 'hi' : n >= 70 ? 'mid' : 'lo');
const platformName = (p: string) => (p === 'youtube' ? 'YouTube' : p === 'instagram' ? 'Instagram' : p);

async function api<T = { ok: boolean; error?: string }>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const r = await fetch(url, body === undefined && method === 'GET' ? { cache: 'no-store' } : {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as T & { ok?: boolean; error?: string };
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function putFile(url: string, file: File, onPct: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(x.responseText || `HTTP ${x.status}`)));
    x.onerror = () => reject(new Error('Network error'));
    x.send(file);
  });
}

export default function StudioApp() {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState('');
  const [project, setProject] = useState<string>('all');
  const [tab, setTab] = useState('needs');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'link' | 'file'>('link');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState<Record<string, string>>({});
  const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({});
  const tabTouched = useRef(false);

  const toast = useCallback((text: string, t?: Toast['tone']) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { id, text, tone: t }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 7000);
  }, []);

  const load = useCallback(async () => {
    try {
      const j = await api<State & { ok: boolean }>('/api/studio/state', undefined, 'GET');
      setS(j);
      setErr('');
      if (j.reminder.length && remind === null) {
        setRemind(j.reminder);
        setPicked(new Set(j.reminder));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the Studio.');
    }
  }, [remind]);

  const active = !!s?.jobs.some((j) => j.status !== 'done' && j.status !== 'failed');
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), active ? 4000 : 20000);
    return () => clearInterval(t);
  }, [load, active]);

  const projects = s?.projects || [];
  const inProject = <T extends { projectId: string }>(list: T[]) => (project === 'all' ? list : list.filter((x) => x.projectId === project));
  const lib = useMemo(() => inProject(s?.library || []), [s, project]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobs = useMemo(() => inProject(s?.jobs || []).slice().reverse(), [s, project]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = Object.fromEntries(TABS.map((t) => [t.key, lib.filter((c) => t.statuses.includes(c.status)).length]));

  // Open the first tab that has something, until you pick one yourself.
  useEffect(() => {
    if (tabTouched.current || !s) return;
    const first = TABS.find((t) => counts[t.key] > 0);
    if (first) setTab(first.key);
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = lib.filter((c) => TABS.find((t) => t.key === tab)!.statuses.includes(c.status))
    .sort((a, b) => b.currentScore - a.currentScore);
  const pname = (id: string) => projects.find((p) => p.id === id)?.name || 'Project';

  async function addProject() {
    const name = newName.trim();
    if (!name) return;
    try {
      const j = await api<{ ok: boolean; project: Project }>('/api/studio/projects', { name });
      setNewName('');
      setAdding(false);
      setProject(j.project.id);
      await load();
    } catch (e) { toast((e as Error).message, 'warn'); }
  }

  async function start() {
    if (project === 'all') return toast('Pick or create a project first.', 'warn');
    setBusy(true);
    try {
      let body: Record<string, unknown> = { projectId: project };
      if (mode === 'link') {
        if (!link.trim()) throw new Error('Paste a video link first.');
        body.url = link.trim();
      } else {
        if (!file) throw new Error('Choose a video file first.');
        const up = await api<{ ok: boolean; upload?: { id: string }; id?: string }>('/api/uploads', { fileName: file.name, size: file.size });
        const id = up.upload?.id || up.id!;
        const u = await api<{ ok: boolean; url: string }>(`/api/uploads/${id}/upload-url`, undefined, 'GET');
        setUpPct(0);
        await putFile(u.url, file, setUpPct);
        body = { ...body, uploadId: id };
      }
      const r = await api<{ ok: boolean; waitingFor: string | null; storageFull: boolean }>('/api/studio/jobs', body);
      setLink('');
      setFile(null);
      if (r.storageFull) toast('Storage is full. This project waits until you delete old clips.', 'warn');
      else if (r.waitingFor) toast(`Studio is busy with “${r.waitingFor}”. “${pname(project)}” starts as soon as it finishes.`, 'warn');
      else toast(`Clipping started for “${pname(project)}”.`, 'ok');
      await load();
    } catch (e) {
      toast((e as Error).message, 'warn');
    } finally {
      setBusy(false);
      setUpPct(null);
    }
  }

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await api(`/api/library/${id}`, { action, ...extra });
      if (action === 'post') toast('Scheduled. It goes out at its time.', 'ok');
      await load();
    } catch (e) { toast((e as Error).message, 'warn'); }
  }

  async function reminder(action: 'delete' | 'skip') {
    try {
      await api('/api/library/bulk', { action, ids: action === 'delete' ? Array.from(picked) : [] });
      setRemind([]);
      if (action === 'delete') toast('Old posted clips deleted. Their records stay under “Deleted”.', 'ok');
      await load();
    } catch (e) { toast((e as Error).message, 'warn'); }
  }

  const used = s?.storage ? s.storage.usedBytes / s.storage.limitBytes : 0;

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display">Nova Studio</h1>
          <p className="muted">Give it a video or a link. Clipping runs on your VM; the best clips are scored, previewed and ready to post.</p>
        </div>
        {s?.storage ? (
          <div className="st-meter" title="Space used on the VM by your clips">
            <span>Storage · {(s.storage.usedBytes / GB).toFixed(1)} of {(s.storage.limitBytes / GB).toFixed(0)} GB</span>
            <span className={`progress${used >= 0.9 ? ' full' : ''}`}><span style={{ width: `${Math.min(100, used * 100)}%` }} /></span>
          </div>
        ) : null}
      </div>

      {err ? <div className="banner banner-warn" role="alert">{err}</div> : null}
      {s && !s.gemini ? <div className="banner banner-warn">Add your Gemini key in <Link href="/settings#ai">Settings</Link> to start clipping.</div> : null}
      {s?.settings.storageFull ? <div className="banner banner-warn">Storage is full. New projects wait until you delete old clips.</div> : null}

      <section className="card" style={{ gap: 14 }}>
        <div className="st-bar">
          <button type="button" className="st-proj" aria-pressed={project === 'all'} onClick={() => setProject('all')}>
            All projects <span className="n">{s?.library.length ?? 0}</span>
          </button>
          {projects.map((p) => (
            <button key={p.id} type="button" className="st-proj" aria-pressed={project === p.id} onClick={() => setProject(p.id)}>
              {p.name} <span className="n">{s?.library.filter((c) => c.projectId === p.id).length ?? 0}</span>
            </button>
          ))}
          {adding ? (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <input className="input" style={{ minHeight: 38, width: 180 }} autoFocus placeholder="Project name" value={newName}
                onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addProject()} />
              <button type="button" className="btn btn-primary" style={{ minHeight: 38 }} onClick={addProject}>Add</button>
            </span>
          ) : (
            <button type="button" className="st-proj" onClick={() => setAdding(true)}>+ New project</button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div className="seg" role="radiogroup" style={{ flex: '0 0 auto' }}>
            <button type="button" role="radio" aria-checked={mode === 'link'} onClick={() => setMode('link')} style={{ padding: '0 16px' }}>Video link</button>
            <button type="button" role="radio" aria-checked={mode === 'file'} onClick={() => setMode('file')} style={{ padding: '0 16px' }}>Upload a video</button>
          </div>
          {mode === 'link' ? (
            <input className="input" style={{ flex: '1 1 300px' }} placeholder="Paste a YouTube or Twitch link" value={link} onChange={(e) => setLink(e.target.value)} />
          ) : (
            <input className="input" style={{ flex: '1 1 300px', paddingTop: 10 }} type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          )}
          <button type="button" className="btn btn-primary" disabled={busy || project === 'all'} onClick={start}>
            {upPct !== null ? `Uploading ${upPct}%` : busy ? 'Starting…' : 'Start clipping'}
          </button>
        </div>
        <span className="hint">
          {project === 'all' ? 'Pick a project (or create one) to start clipping into it. ' : `Clips go into “${pname(project)}”. `}
          Up to {s?.settings.maxParallel ?? 2} projects clip at the same time; others wait in line.
        </span>
      </section>

      {jobs.filter((j) => j.status !== 'done').length ? (
        <section className="card" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>In progress</h2>
          {jobs.filter((j) => j.status !== 'done').map((j) => (
            <div key={j.id} className="st-job">
              <div className="st-job-head">
                <span><strong>{pname(j.projectId)}</strong> · <span className="muted">{j.source.kind === 'url' ? j.source.url : j.source.fileName}</span></span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`chip ${j.status === 'failed' ? 'chip-danger' : j.status === 'waiting' ? 'chip-warn' : 'chip-accent'}`}>
                    {j.status === 'failed' ? 'Failed' : j.status === 'waiting' ? 'Waiting' : `${j.progress}%`}
                  </span>
                  <DetailsToggle open={!!openJobs[j.id]} onClick={() => setOpenJobs((o) => ({ ...o, [j.id]: !o[j.id] }))} />
                </span>
              </div>
              {j.status === 'failed' ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="error" style={{ fontSize: 13 }}>{j.error}</span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-primary" style={{ minHeight: 34, fontSize: 13 }} onClick={() => api(`/api/studio/jobs/${j.id}`, { action: 'retry' }, 'POST').then(load)}>Retry</button>
                    <button type="button" className="btn btn-ghost" style={{ minHeight: 34, fontSize: 13 }} onClick={() => api(`/api/studio/jobs/${j.id}`, undefined, 'DELETE').then(load)}>Remove</button>
                  </span>
                </div>
              ) : (
                <>
                  <span className="progress"><span style={{ width: `${j.progress}%` }} /></span>
                  <span className="hint">{j.status === 'waiting' ? 'Waits for another project to finish' : j.stage || 'Working'}</span>
                </>
              )}
              {openJobs[j.id] ? <JobDetails jobId={j.id} running={j.status === 'clipping' || j.status === 'sending'} /> : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className="card" style={{ gap: 14 }}>
        <div className="st-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { tabTouched.current = true; setTab(t.key); }}>
              {t.label} <span className={`count${t.key === 'needs' && counts[t.key] ? ' hot' : ''}`}>{counts[t.key]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="empty"><p>{s ? 'Nothing here yet.' : 'Loading…'}</p></div>
        ) : (
          <div className="st-grid">
            {shown.map((c) => (
              <article key={c.id} className="st-clip">
                {c.status !== 'deleted' ? (
                  <div className="st-video">
                    {c.preview ? <video src={c.preview} controls preload="metadata" playsInline /> : <span>Making preview…</span>}
                    <div className="st-score">
                      <span>Viral score <b className={tone(c.viralScore)}>{c.viralScore}</b>/100</span>
                      {c.status !== 'posted' && c.currentScore !== c.viralScore ? <span>Now <b className={tone(c.currentScore)}>{c.currentScore}</b>/100</span> : null}
                    </div>
                  </div>
                ) : null}
                <div className="st-body">
                  <span className="st-title">{c.title}</span>
                  <span className="hint">
                    {project === 'all' ? `${pname(c.projectId)} · ` : ''}
                    {c.duration ? `${Math.round(c.duration)} s · ` : ''}
                    {c.status === 'scheduled' ? `Goes out ${fmt(c.scheduledFor)}` :
                      c.status === 'posted' ? `Posted ${fmt(c.postedAt)}` :
                      c.status === 'deleted' ? `Deleted · viral ${c.viralScore}/100` : `Made ${fmt(c.createdAt)}`}
                  </span>
                  {c.postedTo.length || c.autoPosted ? (
                    <div className="st-actions">
                      {c.postedTo.map((p) => <span key={p} className={`chip ${p === 'youtube' ? 'chip-yt' : 'chip-ig'}`}>Posted · {platformName(p)}</span>)}
                      {c.autoPosted ? <span className="chip chip-accent">Auto 90+</span> : null}
                    </div>
                  ) : null}

                  {['confirm', 'approval', 'ready', 'on_hold'].includes(c.status) ? (
                    <input className="input" type="datetime-local" style={{ minHeight: 36, fontSize: 13 }} value={when[c.id] || ''}
                      onChange={(e) => setWhen((w) => ({ ...w, [c.id]: e.target.value }))} title="Leave empty for the next free slot" />
                  ) : null}

                  <div className="st-actions">
                    {c.status === 'confirm' || c.status === 'ready' ? (
                      <button type="button" className="btn btn-primary" onClick={() => act(c.id, 'post', { at: when[c.id] ? new Date(when[c.id]).toISOString() : null })}>
                        {when[c.id] ? 'Schedule' : 'Post (next slot)'}
                      </button>
                    ) : null}
                    {c.status === 'approval' || c.status === 'on_hold' ? (
                      <button type="button" className="btn btn-primary" onClick={() => act(c.id, 'approve')}>Approve</button>
                    ) : null}
                    {c.status === 'approval' || c.status === 'confirm' || c.status === 'ready' ? (
                      <button type="button" className="btn btn-ghost" onClick={() => act(c.id, 'hold')}>Hold</button>
                    ) : null}
                    {c.download ? <a className="btn btn-ghost" href={c.download}>Download</a> : null}
                    {['posted', 'on_hold', 'ready', 'approval', 'confirm'].includes(c.status) ? (
                      <button type="button" className="btn btn-ghost" onClick={() => confirm('Delete this clip’s video files? A record stays.') && act(c.id, 'delete')}>Delete</button>
                    ) : null}
                    {c.status === 'deleted' ? <button type="button" className="btn btn-ghost" onClick={() => act(c.id, 'remove')}>Remove record</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <span className="hint">
          Viral score 90+ {s?.settings.autoPost ? 'posts by itself' : 'asks you first'} · 70–89 asks you to confirm · 50–69 waits for your approval · under 50 goes on hold.
          Clips not posted in 7 days go on hold; posted clips are deleted 7 days after posting (a record stays). <Link href="/settings#automation">Change</Link>
        </span>
      </section>

      {remind && remind.length ? (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Delete old posted clips?">
          <div className="card modal">
            <h2 style={{ fontSize: 20 }}>Delete old posted clips?</h2>
            <p className="muted" style={{ fontSize: 14 }}>These are already on YouTube or Instagram. Deleting frees space on the VM; a record of each stays.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {remind.map((id) => {
                const c = s?.library.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <label key={id} className="check-row">
                    <input type="checkbox" checked={picked.has(id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(id); else n.delete(id); return n; })} />
                    <span style={{ flex: 1 }}>{c.title}</span>
                    <span className="hint">{c.postedTo.map(platformName).join(' + ')} · {fmt(c.postedAt)}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => reminder('skip')}>Skip for now</button>
              <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={() => reminder('delete')}>Delete {picked.size} selected</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone || ''}`}>{t.text}</div>)}
      </div>
    </>
  );
}
