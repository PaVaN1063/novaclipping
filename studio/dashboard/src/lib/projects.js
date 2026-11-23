// Nova Clipping: every clip job started from this browser, so several can run
// at once and you can switch between them (the backend runs up to
// MAX_CONCURRENT_JOBS together and queues the rest).
const KEY = 'nova_projects_v1';
export const PROJECTS_EVENT = 'nova:projects';
const MAX = 30;

export function listProjects() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
  } catch { /* storage full */ }
  window.dispatchEvent(new CustomEvent(PROJECTS_EVENT));
}

export function rememberProject({ jobId, name }) {
  if (!jobId) return;
  const rest = listProjects().filter((p) => p.jobId !== jobId);
  save([{ jobId, name: (name || 'project').slice(0, 120), startedAt: Date.now() }, ...rest]);
}

export function forgetProject(jobId) {
  save(listProjects().filter((p) => p.jobId !== jobId));
}

export function projectNameFrom(data) {
  if (!data) return 'project';
  if (data.type === 'url') {
    const u = String(data.payload || '');
    const m = u.match(/[?&]v=([\w-]{6,})/) || u.match(/youtu\.be\/([\w-]{6,})/);
    return m ? `YouTube · ${m[1]}` : u.replace(/^https?:\/\//, '').slice(0, 60);
  }
  if (data.payload && data.payload.name) return data.payload.name;
  return 'project';
}
