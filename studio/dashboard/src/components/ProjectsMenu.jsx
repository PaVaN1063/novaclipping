// Nova Clipping: switch between clip projects that run at the same time.
import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, ChevronDown, Loader2, CheckCircle2, AlertTriangle, Clock, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { listProjects, forgetProject, PROJECTS_EVENT } from '../lib/projects';

const LABEL = {
  queued: 'waiting',
  processing: 'making clips',
  completed: 'done',
  failed: 'failed',
  gone: 'expired',
};

function StatusIcon({ s }) {
  if (s === 'processing') return <Loader2 size={14} className="animate-spin text-brass shrink-0" />;
  if (s === 'completed') return <CheckCircle2 size={14} className="text-ok shrink-0" />;
  if (s === 'failed' || s === 'gone') return <AlertTriangle size={14} className="text-danger shrink-0" />;
  return <Clock size={14} className="text-muted shrink-0" />;
}

export default function ProjectsMenu({ currentId, onOpen }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(listProjects);
  const [statuses, setStatuses] = useState({});
  const boxRef = useRef(null);

  useEffect(() => {
    const sync = () => setProjects(listProjects());
    window.addEventListener(PROJECTS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PROJECTS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Check each project's status: now, then every 5 s while the list is open
  // (every 20 s otherwise, so the running count in the button stays right).
  useEffect(() => {
    let stopped = false;
    let timer;
    const check = async () => {
      const next = {};
      await Promise.all(projects.map(async (p) => {
        try {
          const res = await apiFetch(`/api/status/${p.jobId}`);
          if (res.status === 404) { next[p.jobId] = 'gone'; return; }
          if (!res.ok) return;
          const d = await res.json();
          next[p.jobId] = d.status === 'complete' ? 'completed' : d.status;
        } catch { /* keep the last known status */ }
      }));
      if (!stopped) setStatuses((s) => ({ ...s, ...next }));
      if (!stopped) timer = setTimeout(check, open ? 5000 : 20000);
    };
    if (projects.length) check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [projects, open]);

  if (!projects.length) return null;
  const running = projects.filter((p) => ['processing', 'queued'].includes(statuses[p.jobId])).length;

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-quiet px-3 py-1.5 text-xs"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FolderOpen size={14} />
        <span className="hidden sm:inline">projects</span>
        <span className="readout">{projects.length}{running ? ` · ${running} running` : ''}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-[min(92vw,380px)] card p-2 shadow-xl max-h-[60vh] overflow-y-auto custom-scrollbar" role="menu">
          <p className="eyebrow px-2 py-1.5">your projects · several can run at once</p>
          {projects.map((p) => {
            const s = statuses[p.jobId];
            const active = p.jobId === currentId;
            return (
              <div key={p.jobId} className={`flex items-center gap-2 rounded-input px-2 py-2 ${active ? 'bg-paper3' : 'hover:bg-paper3'}`}>
                <button
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  disabled={s === 'gone'}
                  onClick={() => { onOpen(p.jobId); setOpen(false); }}
                  role="menuitem"
                >
                  <StatusIcon s={s} />
                  <span className="min-w-0">
                    <span className="block text-xs text-ink truncate">{p.name}</span>
                    <span className="block readout">
                      {LABEL[s] || 'checking…'} · {new Date(p.startedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      {active ? ' · open' : ''}
                    </span>
                  </span>
                </button>
                <button
                  className="p-1.5 text-muted hover:text-danger shrink-0"
                  aria-label={`Remove ${p.name} from the list`}
                  title="Remove from list (the job keeps running on the server)"
                  onClick={() => forgetProject(p.jobId)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <p className="readout px-2 pt-2 pb-1">finished projects are kept on the server for 24 h</p>
        </div>
      )}
    </div>
  );
}
