'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { IconCheck, IconUpload, IconX } from './Icons';
import PlatformIcon from './PlatformIcon';
import { PLATFORM_IDS, PLATFORM_LIST, platformMeta, platformName, type Platform } from '@/lib/platforms';

type AiOut = {
  title: string;
  titleOptions: string[];
  description: string;
  hashtags: string[];
  tags: string[];
  igCaption: string;
  game: string;
  viralScore: number;
  scoreReason: string;
};

type Item = {
  key: string;
  file: File;
  preview: string;
  uploadId: string | null;
  pct: number;
  up: 'waiting' | 'uploading' | 'done' | 'error';
  ai: 'off' | 'waiting' | 'working' | 'done' | 'failed';
  aiError: string;
  title: string;
  titleOptions: string[];
  description: string;
  hashtags: string;
  tags: string[];
  igCaption: string;
  game: string;
  viralScore: number | null;
  scoreReason: string;
};

const GAPS = [1, 2, 3, 6, 12, 24];

function titleFromName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function defaultStart() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

const fmt = (d: Date) =>
  d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function parseHashtags(s: string) {
  return Array.from(
    new Set(
      s
        .split(/[\s,]+/)
        .map((t) => t.trim().replace(/^#*/, ''))
        .filter(Boolean)
        .map((t) => `#${t}`)
    )
  ).slice(0, 30);
}

function putFile(id: string, file: File, onPct: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', `/api/uploads/${id}/file`);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100));
    };
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(x.responseText || `HTTP ${x.status}`)));
    x.onerror = () => reject(new Error('Network error'));
    x.send(file);
  });
}

export default function UploadClient({ aiReady }: { aiReady: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [useAi, setUseAi] = useState(aiReady);
  const [bestFirst, setBestFirst] = useState(true);
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState<Platform[]>(PLATFORM_IDS);
  const togglePlatform = (p: Platform) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const ig = picked.includes('instagram');
  const [mode, setMode] = useState<'draft' | 'schedule'>('schedule');
  const [start, setStart] = useState(defaultStart);
  const [gap, setGap] = useState(3);
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [error, setError] = useState('');

  const chain = useRef<Promise<void>>(Promise.resolve());
  const useAiRef = useRef(useAi);
  useAiRef.current = aiReady && useAi;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Free the video previews when leaving the page.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function analyze(key: string, uploadId: string, force: boolean) {
    update(key, { ai: 'working', aiError: '' });
    try {
      const r = await fetch(`/api/uploads/${uploadId}/analyze`, { method: 'POST' });
      const j = (await r.json()) as { ok: boolean; error?: string; ai?: AiOut };
      if (!j.ok || !j.ai) throw new Error(j.error || 'The AI could not read this video.');
      const ai = j.ai;
      setItems((cur) =>
        cur.map((i) =>
          i.key !== key
            ? i
            : {
                ...i,
                ai: 'done',
                title: force || !i.title.trim() ? ai.title : i.title,
                titleOptions: ai.titleOptions,
                description: force || !i.description.trim() ? ai.description : i.description,
                hashtags: force || !i.hashtags.trim() ? ai.hashtags.join(' ') : i.hashtags,
                tags: ai.tags,
                igCaption: ai.igCaption,
                game: ai.game,
                viralScore: ai.viralScore,
                scoreReason: ai.scoreReason,
              }
        )
      );
    } catch (e) {
      update(key, { ai: 'failed', aiError: e instanceof Error ? e.message : 'AI failed.' });
    }
  }

  // Upload, then (if on) let the AI watch it. One video at a time.
  async function pipeline(key: string, file: File) {
    update(key, { up: 'uploading', pct: 0 });
    try {
      const r = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, size: file.size }),
      });
      const j = (await r.json()) as { ok: boolean; id?: string; error?: string };
      if (!j.ok || !j.id) throw new Error(j.error || 'Could not start the upload.');
      update(key, { uploadId: j.id });
      await putFile(j.id, file, (pct) => update(key, { pct }));
      update(key, { up: 'done', pct: 100 });
      if (useAiRef.current) await analyze(key, j.id, false);
      else update(key, { ai: 'off' });
    } catch (e) {
      update(key, { up: 'error', aiError: e instanceof Error ? e.message : 'Upload failed.' });
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || batchId) return;
    const seen = new Set(itemsRef.current.map((i) => i.key));
    const added: Item[] = Array.from(list)
      .filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name))
      .map((f) => ({
        key: `${f.name}-${f.size}-${f.lastModified}`,
        file: f,
        preview: URL.createObjectURL(f),
        uploadId: null,
        pct: 0,
        up: 'waiting' as const,
        ai: useAiRef.current ? ('waiting' as const) : ('off' as const),
        aiError: '',
        title: '',
        titleOptions: [],
        description: '',
        hashtags: '',
        tags: [],
        igCaption: '',
        game: '',
        viralScore: null,
        scoreReason: '',
      }))
      .filter((i) => !seen.has(i.key));
    if (!added.length) return;
    setItems((cur) => [...cur, ...added]);
    setError('');
    for (const it of added) chain.current = chain.current.then(() => pipeline(it.key, it.file));
  }

  async function remove(it: Item) {
    if (it.uploadId) await fetch(`/api/uploads/${it.uploadId}`, { method: 'DELETE' }).catch(() => {});
    URL.revokeObjectURL(it.preview);
    setItems((cur) => cur.filter((i) => i.key !== it.key));
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    addFiles(e.dataTransfer.files);
  }

  const isSchedule = mode === 'schedule';
  const startOk = !isNaN(new Date(start).getTime());
  const where = picked.map((p) => platformName[p]).join(' + ') || 'No platform picked';
  const n = items.length;
  // Highest AI score first, so the best clips get the earliest slots.
  const ordered = bestFirst && aiReady && useAi
    ? [...items].sort((a, b) => (b.viralScore ?? -1) - (a.viralScore ?? -1))
    : items;
  const uploading = items.some((i) => i.up === 'waiting' || i.up === 'uploading');
  const thinking = items.some((i) => i.ai === 'waiting' || i.ai === 'working');
  const broken = items.some((i) => i.up === 'error');
  const done = !!batchId;
  const canSend = !done && !sending && n > 0 && !uploading && !thinking && !broken && picked.length > 0 && (!isSchedule || startOk);

  const whenFor = useMemo(() => {
    const base = new Date(start).getTime();
    return (i: number) => (isSchedule ? (startOk ? fmt(new Date(base + i * gap * 3600000)) : 'Pick a start time') : 'Draft · Private');
  }, [start, gap, isSchedule, startOk]);

  async function send() {
    setError('');
    setSending(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          caption,
          mode,
          platforms: picked,
          startAt: isSchedule ? new Date(start).toISOString() : null,
          gapHours: gap,
          clips: ordered.map((i) => ({
            uploadId: i.uploadId,
            title: i.title.trim() || titleFromName(i.file.name),
            description: i.description,
            hashtags: parseHashtags(i.hashtags),
            tags: i.tags,
            igCaption: i.igCaption,
            game: i.game,
          })),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; batchId?: string };
      if (!data.ok || !data.batchId) throw new Error(data.error || 'Could not save the batch.');
      setBatchId(data.batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    items.forEach((i) => URL.revokeObjectURL(i.preview));
    setItems([]);
    setName('');
    setBatchId('');
  }

  const sendLabel = sending
    ? 'Saving…'
    : done
      ? 'Batch sent'
      : n === 0
        ? 'Add clips to start'
        : uploading
          ? 'Uploading videos…'
          : thinking
            ? 'AI is writing…'
            : isSchedule
              ? `Schedule ${n} ${n === 1 ? 'clip' : 'clips'}`
              : `Save ${n} ${n === 1 ? 'clip' : 'clips'} as drafts`;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="display" style={{ fontSize: 34 }}>Upload</h1>
        <p className="muted">
          Drop one Short or many. {aiReady && useAi ? 'The AI watches each one and writes the title, description and hashtags — check them, then send.' : 'Add titles, then send them all.'}
        </p>
      </div>

      {done ? (
        <div className="banner banner-ok" role="status" style={{ flexWrap: 'wrap' }}>
          <IconCheck />
          <span style={{ flex: '1 1 300px' }}>Batch saved — {n} {n === 1 ? 'clip is' : 'clips are'} going to {where}.</span>
          <Link href={`/batches/${batchId}`} className="btn btn-ghost" style={{ fontSize: 14 }}>See progress</Link>
          <button type="button" className="btn btn-primary" style={{ fontSize: 14 }} onClick={reset}>New batch</button>
        </div>
      ) : null}
      {error ? <div className="banner banner-warn" role="alert">{error}</div> : null}

      <div className="cols" style={{ gap: 24 }}>
        <div className="col-2" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!done ? (
            <label
              className={`drop${over ? ' over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <span style={{ color: 'var(--accent-text)' }}><IconUpload size={36} /></span>
              <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--heading)' }}>Drop videos here or browse</span>
              <span className="muted" style={{ fontSize: 14 }}>MP4, MOV or WEBM · vertical 9:16 works best for Shorts and Reels</span>
              <input
                type="file"
                multiple
                accept="video/*"
                aria-label="Choose video files"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}

          <h2 style={{ fontSize: 18 }}>{n === 0 ? 'No clips yet' : `${n} ${n === 1 ? 'clip' : 'clips'} in this batch`}</h2>

          {ordered.map((it, idx) => (
            <section className="card" key={it.key} style={{ gap: 14, padding: 18 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <video
                  src={it.preview}
                  muted
                  playsInline
                  controls
                  preload="metadata"
                  style={{ width: 108, height: 192, objectFit: 'cover', borderRadius: 12, background: 'var(--thumb)', flex: 'none' }}
                />
                <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="clip-num">{idx + 1}</span>
                    <span className="hint truncate" style={{ flex: 1, minWidth: 0 }}>
                      {it.file.name} · {(it.file.size / 1048576).toFixed(1)} MB
                    </span>
                    {it.viralScore !== null ? (
                      <span
                        className={`chip ${it.viralScore >= 75 ? 'chip-ok' : it.viralScore >= 50 ? 'chip-accent' : 'chip-warn'}`}
                        title={it.scoreReason}
                      >
                        AI score {it.viralScore}
                      </span>
                    ) : null}
                    <span className="chip chip-accent">{whenFor(idx)}</span>
                    {!done ? (
                      <button type="button" className="icon-btn" aria-label={`Remove ${it.file.name}`} disabled={it.up === 'uploading'} onClick={() => remove(it)}>
                        <IconX />
                      </button>
                    ) : null}
                  </div>

                  {it.up !== 'done' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="progress" aria-hidden="true"><span style={{ width: `${it.pct}%` }} /></span>
                      <span className="hint" style={{ fontSize: 12, color: it.up === 'error' ? 'var(--danger)' : undefined }}>
                        {it.up === 'error' ? `Upload failed: ${it.aiError}` : it.up === 'waiting' ? 'Waiting to upload' : `Uploading ${it.pct}%`}
                      </span>
                    </span>
                  ) : null}

                  {it.ai === 'waiting' || it.ai === 'working' ? (
                    <div className="banner banner-warn" style={{ padding: '10px 14px', fontSize: 14 }}>
                      <span className="dot" style={{ background: 'var(--warn)' }} />
                      {it.ai === 'working' ? 'AI is watching the clip and writing the title, description and hashtags…' : 'AI will watch this clip after it uploads'}
                    </div>
                  ) : null}
                  {it.ai === 'failed' ? (
                    <div className="banner banner-warn" style={{ padding: '10px 14px', fontSize: 14, flexWrap: 'wrap' }}>
                      <span style={{ flex: 1 }}>AI couldn’t finish: {it.aiError}</span>
                      {it.uploadId ? (
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 13, minHeight: 36 }} onClick={() => analyze(it.key, it.uploadId!, false)}>Try again</button>
                      ) : null}
                    </div>
                  ) : null}

                  <label className="field" style={{ gap: 6 }}>
                    <span>Title {it.game ? <span className="chip" style={{ marginLeft: 6 }}>{it.game}</span> : null}</span>
                    <input
                      className="input"
                      value={it.title}
                      maxLength={100}
                      disabled={done}
                      placeholder={aiReady && useAi ? 'AI will write this — or type your own' : titleFromName(it.file.name)}
                      onChange={(e) => update(it.key, { title: e.target.value })}
                    />
                  </label>
                  {it.titleOptions.length > 1 && !done ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span className="hint" style={{ alignSelf: 'center' }}>Other ideas:</span>
                      {it.titleOptions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="chip"
                          aria-pressed={t === it.title}
                          onClick={() => update(it.key, { title: t })}
                          style={{ border: `1px solid ${t === it.title ? 'var(--accent)' : 'var(--border-2)'}`, cursor: 'pointer', minHeight: 32, font: '500 13px var(--font-inter), sans-serif', color: t === it.title ? 'var(--accent-text)' : 'var(--soft)', background: t === it.title ? 'var(--accent-soft)' : 'transparent', whiteSpace: 'normal', textAlign: 'left' }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <label className="field" style={{ gap: 6 }}>
                    <span>Description</span>
                    <textarea className="textarea" rows={4} value={it.description} disabled={done} placeholder="Optional" onChange={(e) => update(it.key, { description: e.target.value })} />
                  </label>

                  <label className="field" style={{ gap: 6 }}>
                    <span>Hashtags</span>
                    <textarea className="textarea" rows={2} value={it.hashtags} disabled={done} placeholder="#shorts #gaming …" onChange={(e) => update(it.key, { hashtags: e.target.value })} style={{ minHeight: 64 }} />
                  </label>

                  {it.scoreReason ? <p className="hint" style={{ marginTop: -4 }}>Why this score: {it.scoreReason}</p> : null}

                  {ig && it.igCaption ? (
                    <label className="field" style={{ gap: 6 }}>
                      <span>Instagram caption</span>
                      <textarea className="textarea" rows={3} value={it.igCaption} disabled={done} onChange={(e) => update(it.key, { igCaption: e.target.value })} />
                    </label>
                  ) : null}

                  {aiReady && it.uploadId && it.up === 'done' && it.ai !== 'working' && !done ? (
                    <div>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 14 }} onClick={() => analyze(it.key, it.uploadId!, true)}>
                        {it.ai === 'done' ? 'Rewrite with AI' : 'Write with AI'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ))}
        </div>

        <aside className="card col-1" aria-label="Batch settings" style={{ gap: 22 }}>
          <h2 style={{ fontSize: 18 }}>Batch settings</h2>

          <div className="field">
            <span>AI writer</span>
            {aiReady ? (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
                <span className="body" style={{ fontSize: 14 }}>Watch each clip after upload and write the title, description and hashtags</span>
                <input type="checkbox" checked={useAi} disabled={done} onChange={(e) => setUseAi(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--accent)', flex: 'none' }} />
              </label>
            ) : (
              <span className="hint">
                Add your free Gemini key in <Link href="/settings#ai">Settings</Link> and the AI will write titles, descriptions and hashtags for you.
              </span>
            )}
          </div>

          {aiReady && useAi && isSchedule ? (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
              <span className="body" style={{ fontSize: 14 }}>Post the best clips first (by AI score)</span>
              <input type="checkbox" checked={bestFirst} disabled={done} onChange={(e) => setBestFirst(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--accent)', flex: 'none' }} />
            </label>
          ) : null}

          <label className="field">
            <span>Name (optional)</span>
            <input className="input" value={name} maxLength={80} disabled={done} placeholder="e.g. Ranked highlights" onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="field">
            <span>Post to</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {PLATFORM_LIST.map((pl) => (
                <button key={pl.id} type="button" className={`toggle-btn ${pl.tone}`} aria-pressed={picked.includes(pl.id)} disabled={done} onClick={() => togglePlatform(pl.id)}>
                  <PlatformIcon id={pl.id} /> {pl.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>When</span>
            <div className="seg" role="radiogroup" aria-label="When to post">
              <button type="button" role="radio" aria-checked={!isSchedule} disabled={done} onClick={() => setMode('draft')}>Save as draft</button>
              <button type="button" role="radio" aria-checked={isSchedule} disabled={done} onClick={() => setMode('schedule')}>Schedule</button>
            </div>
          </div>

          {isSchedule ? (
            <>
              <label className="field">
                <span>First post at</span>
                <input className="input" type="datetime-local" value={start} disabled={done} onChange={(e) => setStart(e.target.value)} />
              </label>
              <div className="field">
                <span>Then one clip every</span>
                <div className="gap-grid">
                  {GAPS.map((h) => (
                    <button key={h} type="button" aria-pressed={gap === h} disabled={done} onClick={() => setGap(h)}>
                      {h === 24 ? '1 day' : `${h} h`}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {picked.length ? (
            <div className="notice">
              {picked.map((p) => (
                <span key={p}>
                  <strong>{platformName[p]}:</strong> {isSchedule ? platformMeta[p].scheduleNote : platformMeta[p].draftNote}
                </span>
              ))}
            </div>
          ) : null}

          <label className="field">
            <span>Extra text under every description (optional)</span>
            <textarea className="textarea" rows={2} value={caption} disabled={done} placeholder="e.g. Follow @theclipdose.official for daily clips" onChange={(e) => setCaption(e.target.value)} />
          </label>

          <button type="button" className="btn btn-primary btn-lg" disabled={!canSend} onClick={send}>{sendLabel}</button>
        </aside>
      </div>
    </>
  );
}
