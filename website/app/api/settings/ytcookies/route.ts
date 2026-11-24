import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';

// YouTube cookies for downloading videos by link. YouTube asks cloud servers
// to "sign in to confirm you're not a bot", so the VM needs the cookies of a
// signed-in YouTube session. They are written to a file on the VM only (read
// by the clipping engine); the page only learns whether they are set.
const DIR = path.join(process.cwd(), 'data', 'youtube');
const FILE = path.join(DIR, 'youtube-cookies.txt');

function summary(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const yt = lines.filter((l) => /(^|\s|\.)youtube\.com\t/.test(l));
  const names = new Set(yt.map((l) => l.split('\t')[5]));
  const loggedIn = ['SID', '__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO'].some((n) => names.has(n));
  let expires: string | null = null;
  const exp = yt.map((l) => Number(l.split('\t')[4])).filter((n) => n > 0);
  if (exp.length) expires = new Date(Math.min(...exp.filter((n) => n > Date.now() / 1000 + 3600).concat([Math.max(...exp)])) * 1000).toISOString();
  return { cookies: yt.length, loggedIn, expires };
}

export async function GET() {
  if (!(await currentUser())) return unauthorized();
  try {
    const [text, st] = await Promise.all([fs.readFile(FILE, 'utf8'), fs.stat(FILE)]);
    let invalid = false;
    try {
      const mark = JSON.parse(await fs.readFile(path.join(DIR, 'status.json'), 'utf8')) as { invalidAt?: string };
      invalid = !!mark.invalidAt && Date.parse(mark.invalidAt) > st.mtime.getTime();
    } catch {}
    return NextResponse.json({ ok: true, set: true, invalid, savedAt: st.mtime.toISOString(), ...summary(text) });
  } catch {
    return NextResponse.json({ ok: true, set: false });
  }
}

export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const b = (await req.json().catch(() => null)) as { text?: string; remove?: boolean } | null;
  if (!b) return badRequest('Bad request.');
  if (b.remove) {
    await fs.rm(FILE, { force: true });
    return NextResponse.json({ ok: true });
  }
  let text = String(b.text || '').replace(/\r\n/g, '\n').trim();
  if (text.length > 500_000) return badRequest('That file is too big for a cookies file.');
  // Some exporters use spaces when pasted; Netscape format needs tabs.
  text = text.split('\n').map((l) => (l.startsWith('#') || l.includes('\t') ? l : l.trim().split(/\s+/).length >= 7 ? l.trim().split(/\s+/).slice(0, 6).join('\t') + '\t' + l.trim().split(/\s+/).slice(6).join(' ') : l)).join('\n');
  const s = summary(text);
  if (!s.cookies) return badRequest('No youtube.com cookies found. Export cookies.txt (Netscape format) while on youtube.com.');
  if (!s.loggedIn) return badRequest('These cookies are not from a signed-in YouTube session. Sign in to YouTube first, then export.');
  if (!text.startsWith('# Netscape')) text = '# Netscape HTTP Cookie File\n' + text;
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE, text + '\n', { mode: 0o644 });
  await fs.rm(path.join(DIR, 'status.json'), { force: true });
  await fs.chmod(FILE, 0o644).catch(() => {});
  return NextResponse.json({ ok: true, ...s });
}
