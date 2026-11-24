'use client';

import { useEffect, useRef, useState } from 'react';

type Step = { key: string; label: string; state: 'waiting' | 'active' | 'done' | 'failed'; detail: string | null; percent: number | null };
type Details = {
  ok: boolean; status: string; error: string | null; steps: Step[]; etaSeconds: number | null;
  elapsedSeconds: number; quietSeconds: number; stuck: boolean; engineReachable: boolean; logs: string[];
  vm: { cpuPercent: number; cores: number; memUsedGb: number; memTotalGb: number };
};

function dur(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// The ⌄ button on a job card. Open: live steps, time, VM load and the log.
export function DetailsToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`st-chevron${open ? ' open' : ''}`} aria-expanded={open} aria-label={open ? 'Hide details' : 'Show details and logs'} title={open ? 'Hide details' : 'Show details and logs'} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

export default function JobDetails({ jobId, running }: { jobId: string; running: boolean }) {
  const [d, setD] = useState<Details | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const r = await fetch(`/api/studio/jobs/${jobId}/logs`, { cache: 'no-store' });
        const j = (await r.json()) as Details & { error?: string };
        if (stop) return;
        if (!r.ok || !j.ok) setErr(j.error || 'Could not load details.');
        else { setD(j); setErr(null); }
      } catch {
        if (!stop) setErr('Could not reach the VM.');
      }
    }
    load();
    const t = running ? setInterval(load, 4000) : null;
    return () => { stop = true; if (t) clearInterval(t); };
  }, [jobId, running]);

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [d, follow]);

  if (!d) return <div className="st-details"><span className="hint">{err || 'Loading details…'}</span></div>;

  return (
    <div className="st-details">
      <div className="st-meta">
        <span>⏱ Running {dur(d.elapsedSeconds)}</span>
        {d.etaSeconds ? <span>≈ {dur(d.etaSeconds)} left in this step</span> : null}
        <span>VM CPU {d.vm.cpuPercent}% · {d.vm.cores} cores</span>
        <span>RAM {d.vm.memUsedGb} / {d.vm.memTotalGb} GB</span>
        {!d.engineReachable ? <span className="error">Engine not answering</span> : null}
      </div>
      {d.stuck ? (
        <p className="error" style={{ fontSize: 13 }}>No new log lines for {dur(d.quietSeconds)} — this looks stuck. Check the log below; you can remove the job and start it again.</p>
      ) : null}
      <ol className="st-steps">
        {d.steps.map((s) => (
          <li key={s.key} className={`st-step ${s.state}`}>
            <span className="dot" aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'failed' ? '!' : ''}</span>
            <span className="lbl">{s.label}</span>
            {s.detail ? <span className="det">{s.detail}</span> : null}
            {s.state === 'active' && s.percent !== null ? <span className="progress small"><span style={{ width: `${s.percent}%` }} /></span> : null}
          </li>
        ))}
      </ol>
      <div className="st-logbar">
        <span className="hint">Engine log · last {d.logs.length} lines{running ? ' · live' : ''}</span>
        <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
      </div>
      <pre ref={box} className="st-log">{d.logs.length ? d.logs.join('\n') : 'No log yet — the job has not reached the engine.'}</pre>
    </div>
  );
}
