import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { readDb, updateDb } from '@/lib/store';

// Save the Gemini API key (kept on this machine only, never sent back) and an optional model name.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { apiKey?: string; model?: string; remove?: boolean } | null;
  if (!body) return badRequest('Bad request.');

  if (body.remove) {
    await updateDb((d) => {
      d.secrets.gemini.apiKey = null;
      d.secrets.gemini.updatedAt = new Date().toISOString();
    });
    return NextResponse.json({ ok: true });
  }

  const apiKey = (body.apiKey || '').trim();
  const model = (body.model || '').trim().slice(0, 80);
  if (apiKey && apiKey.length < 20) return badRequest('That key looks too short.');

  await updateDb((d) => {
    if (apiKey) {
      d.secrets.gemini.apiKey = apiKey;
      d.secrets.gemini.updatedAt = new Date().toISOString(); // the Studio picks up the newer key
    }
    d.secrets.gemini.model = model || null;
  });
  return NextResponse.json({ ok: true });
}

// Check the saved Gemini key from the VM: is it valid, and is Gemini
// answering right now? The key itself never leaves the VM.
export async function GET() {
  if (!(await currentUser())) return unauthorized();
  const key = (await readDb()).secrets.gemini.apiKey;
  if (!key) return NextResponse.json({ ok: true, set: false });
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  try {
    const r = await fetch(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (r.status === 400 || r.status === 401 || r.status === 403) return NextResponse.json({ ok: true, set: true, valid: false, reason: 'Google says this key is not valid.' });
    const j = (await r.json().catch(() => ({}))) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const models = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', ''))
      .filter((n) => /^gemini-.*flash/.test(n) && !/image|tts|audio|live/.test(n));
    const t0 = Date.now();
    let answering: 'yes' | 'busy' | 'slow' = 'yes';
    let detail = '';
    try {
      const g = await fetch(`${base}/models/gemini-3.1-flash-lite:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the word ok.' }] }] }),
      });
      if (!g.ok) { answering = 'busy'; detail = `${g.status}`; }
    } catch { answering = 'slow'; }
    return NextResponse.json({ ok: true, set: true, valid: true, models, answering, detail, ms: Date.now() - t0 });
  } catch {
    return NextResponse.json({ ok: true, set: true, valid: null, reason: 'Could not reach Google from the VM.' });
  }
}
