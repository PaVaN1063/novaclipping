import Link from 'next/link';
import { IconChevron } from '@/components/Icons';
import { fmtTime, istDayKey, weekDays } from '@/lib/format';
import { platformMeta } from '@/lib/platforms';
import { platformName, postLabel } from '@/lib/status';
import { readDb } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const offset = Math.max(-52, Math.min(52, parseInt(week || '0', 10) || 0));
  const days = weekDays(offset);
  const today = istDayKey(Date.now());

  const db = await readDb();
  const clipById = new Map(db.clips.map((c) => [c.id, c]));
  const keys = new Set(days.map((d) => d.key));
  const byDay = new Map<string, typeof db.posts>();
  for (const p of db.posts) {
    if (!p.publishAt) continue;
    const k = istDayKey(p.publishAt);
    if (!keys.has(k)) continue;
    byDay.set(k, [...(byDay.get(k) || []), p]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.publishAt!.localeCompare(b.publishAt!));
  const drafts = db.posts.filter((p) => p.mode === 'draft').length;
  const total = Array.from(byDay.values()).reduce((n, l) => n + l.length, 0);

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display">Schedule</h1>
          <p className="muted">
            {days[0].label} – {days[6].label} · times in IST · {total} {total === 1 ? 'post' : 'posts'}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link href={`/schedule?week=${offset - 1}`} className="icon-btn" aria-label="Previous week"><IconChevron dir="left" /></Link>
          <Link href="/schedule" className="btn btn-ghost" style={{ fontSize: 14 }}>This week</Link>
          <Link href={`/schedule?week=${offset + 1}`} className="icon-btn" aria-label="Next week"><IconChevron /></Link>
        </div>
      </div>

      <div className="week">
        <div className="week-grid">
          {days.map((d) => (
            <div className="day" key={d.key}>
              <div className={`day-head${d.key === today ? ' today' : ''}`}>
                <span className="muted" style={{ fontSize: 13 }}>{d.dow}</span>
                <span className="day-num">{d.num}</span>
              </div>
              <div className="day-posts">
                {(byDay.get(d.key) || []).map((p) => {
                  const label = postLabel(p);
                  return (
                    <div className={`post ${platformMeta[p.platform].tone}`} key={p.id} title={p.error || label.text}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--soft)' }}>{fmtTime(p.publishAt!)}</span>
                      <span style={{ fontSize: 13, lineHeight: 1.35, color: 'var(--heading)' }}>{clipById.get(p.clipId)?.title ?? 'Clip'}</span>
                      <span className="hint" style={{ fontSize: 11 }}>{platformName[p.platform]} · {label.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13 }} className="muted">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 4, borderRadius: 2, background: 'var(--yt)' }} />YouTube</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 4, borderRadius: 2, background: 'var(--ig)' }} />Instagram</span>
        {drafts ? <span>{drafts} draft {drafts === 1 ? 'post has' : 'posts have'} no time, so they aren’t shown here.</span> : null}
      </div>
    </>
  );
}
