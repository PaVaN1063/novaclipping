// Where this copy of the website runs. Edge-safe (no Node imports).
//
//  local  (default)  your laptop: pages + API + data, one process.
//  web               Netlify: pages and Google login only. Every /api call is
//                    passed on to the engine; no data or keys live here.
//  engine            Oracle VM: the API, the data, the keys and the worker.
//                    It answers only the web copy (shared ENGINE_SECRET) or a
//                    short-lived signed link for big files. No pages.
export type Role = 'local' | 'web' | 'engine';

export const ROLE: Role =
  process.env.NOVA_ROLE === 'web' ? 'web' : process.env.NOVA_ROLE === 'engine' ? 'engine' : 'local';

/** Engine address as the web copy's server calls it. */
export const ENGINE_URL = (process.env.ENGINE_URL || '').replace(/\/+$/, '');
/** Engine address as a browser reaches it (big uploads and downloads go here directly). */
export const PUBLIC_ENGINE_URL = (process.env.PUBLIC_ENGINE_URL || process.env.ENGINE_URL || '').replace(/\/+$/, '');
export const ENGINE_SECRET = process.env.ENGINE_SECRET || '';

/** The public address of the website. */
export const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');

/** Google accounts allowed to sign in. Nobody else gets in. */
export const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || 'cocopupstv@gmail.com,pavankumarnaraharisetti5763@gmail.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
