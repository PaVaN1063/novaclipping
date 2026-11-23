import Link from 'next/link';
import { notFound } from 'next/navigation';
import path from 'path';
import { AutoRefresh, CopyButton, RetryButton } from '@/components/BatchActions';
import { IconChevron, IconPlay } from '@/components/Icons';
import { fmtWhen, mb } from '@/lib/format';
import { finalText } from '@/lib/publishing';
import { chipClass, platformMeta } from '@/lib/platforms';
import { batchSummary, platformName, postLabel } from '@/lib/status';
import { STORAGE_DIR, readDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

const aiLabel: Record<string, { text: string; tone: string }> = {
  off: { text: 'AI off', tone: '' },
  pending: { text: 'AI waiting', tone: 'warn' },
  working: { text: 'AI is watching the clip…', tone: 'warn' },
  done: { text: 'Title & description ready', tone: 'accent' },
  failed: { text: 'AI failed — used your title', tone: 'danger' },
};

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readDb();
  const batch = db.batches.find((b) => b.id === id);
  if (!batch) notFound();

  const clips = db.clips.filter((c) => c.batchId === id).sort((a, b) => a.index - b.index);
  const posts = db.posts.filter((p) => p.batchId === id);
  const summary = batchSummary(posts);
  const busy =
    posts.some((p) => ['waiting_file', 'queued', 'working'].includes(p.status) && (platformMeta[p.platform].nativeSchedule || !p.publishAt || Date.parse(p.publishAt) <= Date.now() + 60_000)) ||
    clips.some((c) => c.ai?.status === 'pending' || c.ai?.status === 'working');
  const hasFailed = posts.some((p) => p.status === 'failed') || clips.some((c) => c.ai?.status === 'failed') || (!!db.secrets.gemini.apiKey && clips.some((c) => !c.ai));

  return (
    <>
      <AutoRefresh active={busy} />
      <Link href="/dashboard" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, textDecoration: 'none' }}>
        <IconChevron dir="left" size={16} /> Dashboard
      </Link>

      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display" style={{ fontSize: 30 }}>{batch.name}</h1>
          <p className="muted">
            {clips.length} {clips.length === 1 ? 'clip' : 'clips'} · {batch.mode === 'draft' ? 'Drafts' : `Scheduled from ${batch.startAt ? fmtWhen(batch.startAt) : '—'}`} ·{' '}
            {batch.platforms.map((p) => platformName[p]).join(', ')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`chip${summary.tone ? ' chip-' + summary.tone : ''}`}>{busy ? 'Working…' : summary.text}</span>
          {hasFailed ? <RetryButton id={batch.id} label={db.secrets.gemini.apiKey && clips.some((c) => !c.ai || c.ai.status === 'failed') ? 'Retry with AI' : 'Retry upload'} /> : null}
        </div>
      </div>

      {clips.map((c) => {
        const t = finalText(c, batch);
        const ai = c.ai ? aiLabel[c.ai.status] : null;
        const cPosts = posts.filter((p) => p.clipId === c.id);
        return (
          <section className="card" key={c.id} style={{ gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="thumb" style={{ width: 54, height: 96 }}><IconPlay /></div>
              <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {ai ? <span className={`chip${ai.tone ? ' chip-' + ai.tone : ''}`}>{ai.text}</span> : null}
                  {c.ai?.game ? <span className="chip">{c.ai.game}</span> : null}
                  {typeof c.ai?.viralScore === 'number' ? (
                    <span className={`chip ${c.ai.viralScore >= 75 ? 'chip-ok' : c.ai.viralScore >= 50 ? 'chip-accent' : 'chip-warn'}`} title={c.ai.scoreReason || ''}>AI score {c.ai.viralScore}</span>
                  ) : null}
                  {c.titleEdited ? <span className="chip">Your title</span> : null}
                </div>
                <h2 style={{ fontSize: 19 }}>{t.title}</h2>
                <span className="hint">
                  {c.fileName} · {mb(c.size)}
                  {c.storedAs ? <> · saved at <code style={{ fontSize: 12 }}>{path.join(STORAGE_DIR, c.storedAs)}</code></> : ' · file not uploaded'}
                </span>
                {c.ai?.status === 'failed' && c.ai.error ? <span className="error" style={{ fontSize: 13 }}>AI: {c.ai.error}</span> : null}
              </div>
            </div>

            {t.description ? (
              <div className="field" style={{ gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Description</span>
                  <CopyButton text={t.description} />
                </div>
                <div className="notice" style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{t.description}</div>
              </div>
            ) : null}

            {c.ai?.hashtags.length ? (
              <div className="field" style={{ gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Hashtags</span>
                  <CopyButton text={c.ai.hashtags.join(' ')} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.ai.hashtags.map((h) => <span className="chip chip-accent" key={h}>{h}</span>)}
                </div>
              </div>
            ) : null}

            {c.ai?.tags.length ? (
              <p className="hint">YouTube tags: {c.ai.tags.join(', ')}</p>
            ) : null}

            {c.ai?.igCaption && batch.platforms.includes('instagram') ? (
              <div className="field" style={{ gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Instagram caption</span>
                  <CopyButton text={c.ai.igCaption} />
                </div>
                <div className="notice" style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{c.ai.igCaption}</div>
              </div>
            ) : null}

            <div className="divider" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cPosts.map((p) => {
                const l = postLabel(p);
                return (
                  <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                    <span className={chipClass(p.platform)}>{platformName[p.platform]}</span>
                    <span className={`chip${l.tone ? ' chip-' + l.tone : ''}`}>{l.text}</span>
                    {p.publishAt ? <span className="hint">{fmtWhen(p.publishAt)}</span> : null}
                    {p.error ? <span className="error" style={{ fontSize: 13 }}>{p.error}</span> : null}
                    {p.externalUrl ? (
                      <a className="btn btn-ghost" style={{ fontSize: 13, minHeight: 36, padding: '0 12px' }} href={p.externalUrl} target="_blank" rel="noreferrer">
                        Open on {platformName[p.platform]}
                      </a>
                    ) : p.platform === 'youtube' && p.externalId ? (
                      <a className="btn btn-ghost" style={{ fontSize: 13, minHeight: 36, padding: '0 12px' }} href={`https://studio.youtube.com/video/${p.externalId}/edit`} target="_blank" rel="noreferrer">
                        Open in YouTube Studio
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
