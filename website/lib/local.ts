// Is a request coming from this computer (localhost), or from outside (tunnel / server)?
export function isLocalHost(host: string | null | undefined) {
  const h = (host || '').toLowerCase().replace(/:\d+$/, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

// The "Quick access" button (no password) only works on this computer, never through a tunnel.
export function quickAccessAllowed(host: string | null | undefined) {
  if (process.env.NOVA_QUICK_ACCESS === 'true') return true;
  return process.env.NODE_ENV !== 'production' && isLocalHost(host);
}
