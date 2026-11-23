// Runs once when the Next.js server starts: starts the background worker
// (uploads, scheduling, posting). Not on Netlify: the engine on the VM does it.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NOVA_ROLE !== 'web') {
    const { startWorker } = await import('./lib/worker');
    startWorker();
  }
}
