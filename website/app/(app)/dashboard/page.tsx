import Link from 'next/link';
import DeleteBatchButton from '@/components/DeleteBatchButton';
import { IconInstagram, IconPlay, IconPlus, IconYouTube } from '@/components/Icons';
import { fmtDate, fmtWhen } from '@/lib/format';
import { chipClass } from '@/lib/platforms';
import { batchSummary, platformName, postLabel } from '@/lib/status';
import { INBOX_DIR, readDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function Dashboard() {
  const db = await readDb();
  const clipping = db.jobs.filter((j) => j.status === 'sending' || j.status === 'clipping').length;
  const needsYou = db.library.filter((c) => c.status === 'confirm' || c.status === 'approval').length;
  const readyCount = db.library.filter((c) => c.status === 'ready').length;
  const now = Date.now();
  const week = now + 7 * 86400000;
  const clipById = new Map(db.clips.map((c) => [c.id, c]));

  const scheduled = db.posts.filter(
    (p) => p.mode === 'schedule' && p.publishAt && Date.parse(p.publishAt) > now && Date.parse(p.publishAt) <= week && p.status !== 'failed'
  ).length;
  const drafts = db.posts.filter((p) => p.mode === 'draft' && (p.status === 'done' || p.status === 'held')).length;
  const inQueue = db.posts.filter((p) => ['waiting_file', 'queued', 'needs_connection', 'working'].includes(p.status)).length;
  const waitingConn = db.posts.filter((p) => p.status === 'needs_connection').length;
  const published = db.posts.filter(
    (p) => p.status === 'done' && p.mode === 'schedule' && (!p.publishAt || Date.parse(p.publishAt) <= now)
  ).length;

  const stats = [
    { label: 'Scheduled', value: scheduled, note: 'Next 7 days' },
    { label: 'Drafts', value: drafts, note: 'On YouTube or held in Nova' },
    { label: 'In queue', value: inQueue, note: waitingConn ? `${waitingConn} waiting for a connected account` : 'Waiting to be sent' },
    { label: 'Published', value: published, note: 'All time' },
  ];

  const upNext = db.posts
    .filter((p) => p.mode === 'schedule' && p.publishAt && Date.parse(p.publishAt) > now && p.status !== 'failed')
    .sort((a, b) => Date.parse(a.publishAt!) - Date.parse(b.publishAt!))
    .slice(0, 6);

  const batches = [...db.batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  const { youtube, instagram } = db.connections;

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display">{greeting()}, Pavan</h1>
          <p className="muted">Here’s what’s queued across your channels.</p>
        </div>
        <Link href="/upload" className="btn btn-primary"><IconPlus /> Upload clips</Link>
      </div>

      <div className="stats">
        {stats.map((s) => (
          <div className="card stat" key={s.label}>
            <span className="muted" style={{ fontSize: 14 }}>{s.label}</span>
            <span className="stat-value">{s.value}</span>
            <span className="muted" style={{ fontSize: 13 }}>{s.note}</span>
          </div>
        ))}
      </div>

      <div className="cols">
        <section className="card col-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18 }}>Up next</h2>
            <Link href="/schedule" style={{ fontSize: 14 }}>View schedule</Link>
          </div>
          {upNext.length === 0 ? (
            <div className="empty">
              <p>Nothing scheduled yet.</p>
              <Link href="/upload" className="btn btn-ghost" style={{ fontSize: 14 }}>Schedule a batch</Link>
            </div>
          ) : (
            upNext.map((p) => {
              const clip = clipById.get(p.clipId);
              const label = postLabel(p, now);
              return (
                <div className="row-item" key={p.id}>
                  <div className="thumb"><IconPlay /></div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="truncate" style={{ fontWeight: 500 }}>{clip?.title ?? 'Clip'}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{fmtWhen(p.publishAt!)} · {label.text}</span>
                  </div>
                  <span className={chipClass(p.platform)}>{platformName[p.platform]}</span>
                </div>
              );
            })
          )}
        </section>

        <div className="col-1" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="card" style={{ gap: 14 }}>
            <h2 style={{ fontSize: 18 }}>Channels</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--yt)' }}><IconYouTube size={28} /></span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 500, color: 'var(--heading)' }}>YouTube</span>
                <span className="muted" style={{ fontSize: 13 }}>{youtube.connected ? youtube.account : 'Not connected'}</span>
              </div>
              {youtube.connected ? (
                <span className="chip chip-ok">Connected</span>
              ) : (
                <Link href="/settings" className="btn btn-ghost" style={{ fontSize: 14 }}>Connect</Link>
              )}
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--ig)' }}><IconInstagram size={28} /></span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 500, color: 'var(--heading)' }}>Instagram</span>
                <span className="muted" style={{ fontSize: 13 }}>{instagram.connected ? instagram.account : 'Not connected'}</span>
              </div>
              {instagram.connected ? (
                <span className="chip chip-ok">Connected</span>
              ) : (
                <Link href="/settings#instagram" className="btn btn-ghost" style={{ fontSize: 14 }}>Connect</Link>
              )}
            </div>
          </section>

          <section className="card" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="dot" style={{ background: db.autopilot.enabled ? 'var(--ok)' : 'var(--border-2)' }} />
              <h2 style={{ fontSize: 18 }}>Autopilot</h2>
              <span className={`chip ${db.autopilot.enabled ? 'chip-ok' : ''}`} style={{ marginLeft: 'auto' }}>{db.autopilot.enabled ? 'On' : 'Off'}</span>
            </div>
            <p className="body" style={{ fontSize: 14 }}>
              {db.autopilot.enabled
                ? 'Watching your inbox folder. New videos are written up by the AI, ranked, and scheduled best-first.'
                : 'Turn it on and Nova handles new videos by itself — no clicks.'}
            </p>
            {db.autopilot.enabled ? <code className="hint" style={{ wordBreak: 'break-all' }}>{INBOX_DIR}</code> : null}
            <Link href="/settings#autopilot" style={{ fontSize: 14 }}>Autopilot settings</Link>
          </section>

          <section className="card" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="dot" style={{ background: needsYou ? 'var(--accent)' : 'var(--ok)' }} />
              <h2 style={{ fontSize: 18 }}>Studio</h2>
            </div>
            <p className="body" style={{ fontSize: 14 }}>
              {clipping ? `${clipping} project${clipping > 1 ? 's' : ''} clipping now. ` : ''}
              {needsYou ? `${needsYou} clip${needsYou > 1 ? 's' : ''} waiting for you.` : 'Nothing waiting for you.'}
              {readyCount ? ` ${readyCount} ready to post.` : ''}
            </p>
            <Link href="/studio" style={{ fontSize: 14 }}>Open Studio</Link>
          </section>
        </div>
      </div>

      <section className="card">
        <h2 style={{ fontSize: 18 }}>Recent batches</h2>
        {batches.length === 0 ? (
          <div className="empty">
            <p>No batches yet. Your first upload will show up here.</p>
            <Link href="/upload" className="btn btn-primary" style={{ fontSize: 14 }}>Start a batch</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Batch</th><th>Clips</th><th>Mode</th><th>Platforms</th><th>Created</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const posts = db.posts.filter((p) => p.batchId === b.id);
                  const clips = db.clips.filter((c) => c.batchId === b.id).length;
                  const s = batchSummary(posts, now);
                  return (
                    <tr key={b.id}>
                      <td><Link href={`/batches/${b.id}`}>{b.name}</Link></td>
                      <td>{clips}</td>
                      <td>{b.mode === 'draft' ? 'Draft' : `Scheduled · every ${b.gapHours === 24 ? 'day' : b.gapHours + ' h'}`}</td>
                      <td>{b.platforms.map((p) => platformName[p]).join(', ')}</td>
                      <td>{fmtDate(b.createdAt)}</td>
                      <td><span className={`chip${s.tone ? ' chip-' + s.tone : ''}`}>{s.text}</span></td>
                      <td style={{ textAlign: 'right' }}><DeleteBatchButton id={b.id} name={b.name} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
