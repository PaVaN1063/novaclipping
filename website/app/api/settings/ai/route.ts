import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { updateDb } from '@/lib/store';

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
