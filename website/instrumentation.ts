// Runs once when the Next.js server starts: starts the background worker.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorker } = await import('./lib/worker');
    startWorker();
  }
}
