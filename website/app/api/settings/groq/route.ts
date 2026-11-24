import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';

// Groq key: free backup AI for finding moments, and fast speech-to-text.
// Saved as a file on the VM only (the clipping engine reads it); the page
// only learns whether it is set and whether Groq accepts it.
const DIR = path.join(process.cwd(), 'data', 'youtube');
const FILE = path.join(DIR, 'groq-key.txt');

async function check(key: string) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (r.status === 401 || r.status === 403) return { valid: false, reason: 'Groq says this key is not valid.' };
    if (!r.ok) return { valid: null, reason: `Groq answered ${r.status}; try again later.` };
    const j = (await r.json()) as { data?: { id: string }[] };
    const ids = (j.data || []).map((m) => m.id);
    return { valid: true, chat: ids.filter((i) => !/whisper|guard|tts|playai|orpheus/i.test(i)).length, whisper: ids.some((i) => /whisper/i.test(i)) };
  } catch {
    return { valid: null, reason: 'Could not reach Groq from the VM.' };
  }
}

export async function GET() {
  if (!(await currentUser())) return unauthorized();
  try {
    const [key, st] = await Promise.all([fs.readFile(FILE, 'utf8'), fs.stat(FILE)]);
    return NextResponse.json({ ok: true, set: true, savedAt: st.mtime.toISOString(), ...(await check(key.trim())) });
  } catch {
    return NextResponse.json({ ok: true, set: false });
  }
}

export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const b = (await req.json().catch(() => null)) as { key?: string; remove?: boolean } | null;
  if (!b) return badRequest('Bad request.');
  if (b.remove) {
    await fs.rm(FILE, { force: true });
    return NextResponse.json({ ok: true });
  }
  const key = String(b.key || '').trim();
  if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) return badRequest('A Groq key starts with gsk_.');
  const c = await check(key);
  if (c.valid === false) return badRequest(c.reason || 'Groq says this key is not valid.');
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE, key + '\n', { mode: 0o644 });
  await fs.chmod(FILE, 0o644).catch(() => {});
  return NextResponse.json({ ok: true, ...c });
}
