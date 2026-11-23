// AI: Gemini watches the clip and writes the title, description, hashtags and tags.
import { promises as fs } from 'fs';
import path from 'path';
import type { Db } from './store';

const BASE = 'https://generativelanguage.googleapis.com';
// Tried in order until one exists for your key. You can set your own in Settings.
const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-2.5-flash'];

export type AiOutput = {
  title: string;
  titleOptions: string[];
  description: string;
  hashtags: string[];
  tags: string[];
  igCaption: string;
  game: string;
  viralScore: number;
  scoreReason: string;
};

export function aiReady(db: Db) {
  return !!db.secrets.gemini.apiKey;
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/mp4',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geminiError(r: Response) {
  try {
    const j = (await r.json()) as { error?: { message?: string } };
    return j.error?.message || `Gemini error ${r.status}`;
  } catch {
    return `Gemini error ${r.status}`;
  }
}

type GFile = { name: string; uri: string; mimeType?: string; state?: string };

async function uploadToGemini(key: string, filePath: string, displayName: string): Promise<GFile> {
  const mime = MIME[path.extname(filePath).toLowerCase()] || 'video/mp4';
  const data = new Uint8Array(await fs.readFile(filePath));

  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(data.byteLength),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
  });
  if (!start.ok) throw new Error(await geminiError(start));
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini did not return an upload address.');

  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: data,
  });
  if (!up.ok) throw new Error(await geminiError(up));
  const { file } = (await up.json()) as { file: GFile };

  // Wait until Gemini has processed the video.
  let current = file;
  for (let i = 0; i < 60 && current.state !== 'ACTIVE'; i++) {
    if (current.state === 'FAILED') throw new Error('Gemini could not process this video.');
    await sleep(3000);
    const r = await fetch(`${BASE}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': key } });
    if (!r.ok) throw new Error(await geminiError(r));
    current = (await r.json()) as GFile;
  }
  if (current.state !== 'ACTIVE') throw new Error('Gemini took too long to process the video.');
  return { ...current, mimeType: current.mimeType || mime };
}

function prompt(channel: string, hint: string) {
  return `You run the gaming Shorts/Reels channel ${channel} and you're great at getting clips discovered.
Watch this whole clip carefully (visuals, on-screen text, kill feed, voice, reactions) and write the post for YouTube Shorts and Instagram Reels.

Goal: maximum reach, but it must sound natural — like a real gamer posting, not a bot or spam.

- game: which game this is, from what you see and hear. If unsure, "Gaming".
- titleOptions: exactly 3 different titles, each under 60 characters, about what really happens in THIS clip:
  1) a curiosity hook that makes people stop scrolling,
  2) a hype/reaction style title,
  3) a simple natural title with the game name for search.
  Max 1 emoji per title. No hashtags. Never promise something the clip doesn't show.
- title: the best of the three.
- description: 2–3 short, natural lines describing the moment (include the game name and 1–2 words people search, like "clutch", "funny moment"), then a line asking viewers to follow ${channel}. No hashtags here.
- hashtags: 12–15 hashtags for reach: 3–4 big ones (#shorts #gaming #gamer ...), 5–6 game-specific ones (#valorant #valorantclips ...), and 3–4 for the type of moment (#clutch #funnymoments ...). Each starts with #, no spaces, all relevant to this clip.
- tags: 10–15 plain YouTube search tags (no #), game name first.
- igCaption: a short, punchy Instagram caption (1–2 lines, can use 1–2 emojis) followed by the hashtags.
- viralScore: an honest 1–100 rating of how well this clip will do as a Short/Reel. Judge: does something exciting happen in the first 2 seconds, how strong is the payoff (clutch, funny, skill, rage, surprise), is it easy to follow without context, would people rewatch or share it, audio/visual quality. Most clips land 40–75; keep 85+ for truly exceptional ones.
- scoreReason: one short sentence explaining the score.
${hint ? `The file name may give a hint: "${hint}".` : ''}`;
}

const schema = {
  type: 'OBJECT',
  properties: {
    game: { type: 'STRING' },
    titleOptions: { type: 'ARRAY', items: { type: 'STRING' } },
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    igCaption: { type: 'STRING' },
    viralScore: { type: 'INTEGER' },
    scoreReason: { type: 'STRING' },
  },
  required: ['game', 'titleOptions', 'title', 'description', 'hashtags', 'tags', 'igCaption', 'viralScore', 'scoreReason'],
};

async function generate(key: string, models: string[], file: GFile, text: string) {
  let lastError = 'No Gemini model available.';
  for (const model of models) {
    const r = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ file_data: { mime_type: file.mimeType, file_uri: file.uri } }, { text }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.9 },
      }),
    });
    if (r.status === 404) {
      lastError = `Model "${model}" not found.`;
      continue; // try the next model name
    }
    if (!r.ok) throw new Error(await geminiError(r));
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const out = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!out) throw new Error('Gemini returned an empty answer.');
    return JSON.parse(out) as Partial<AiOutput>;
  }
  throw new Error(lastError);
}

function cleanTag(t: string) {
  const s = t.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return s ? `#${s}` : '';
}

function tidy(raw: Partial<AiOutput>): AiOutput {
  const hashtags = Array.from(new Set((raw.hashtags || []).map(cleanTag).filter(Boolean)));
  if (!hashtags.some((h) => h.toLowerCase() === '#shorts')) hashtags.unshift('#shorts');
  const tags: string[] = [];
  let total = 0;
  for (const t of raw.tags || []) {
    const s = String(t).replace(/[<>#,]/g, '').trim();
    if (!s || total + s.length + 1 > 450) continue;
    tags.push(s);
    total += s.length + 1;
    if (tags.length >= 15) break;
  }
  const cleanTitle = (t: unknown) => String(t || '').replace(/[<>#]/g, '').trim().slice(0, 100);
  const title = cleanTitle(raw.title);
  const titleOptions = Array.from(new Set([...(raw.titleOptions || []).map(cleanTitle), title].filter(Boolean))).slice(0, 4);
  return {
    game: String(raw.game || 'Gaming').slice(0, 60),
    title: title || titleOptions[0] || '',
    titleOptions,
    description: String(raw.description || '').replace(/[<>]/g, '').trim().slice(0, 3000),
    hashtags: hashtags.slice(0, 15),
    tags,
    igCaption: String(raw.igCaption || '').trim().slice(0, 2000),
    viralScore: Math.max(1, Math.min(100, Math.round(Number(raw.viralScore) || 50))),
    scoreReason: String(raw.scoreReason || '').trim().slice(0, 300),
  };
}

export async function analyzeClip(
  db: Db,
  args: { filePath: string; fileName: string; channel: string }
): Promise<AiOutput> {
  const key = db.secrets.gemini.apiKey;
  if (!key) throw new Error('Add your Gemini API key in Settings.');
  const own = db.secrets.gemini.model?.trim();
  const models = own ? [own, ...DEFAULT_MODELS.filter((m) => m !== own)] : DEFAULT_MODELS;

  const file = await uploadToGemini(key, args.filePath, args.fileName);
  try {
    const hint = args.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    return tidy(await generate(key, models, file, prompt(args.channel, hint)));
  } finally {
    // Don't leave the video on Google's side.
    void fetch(`${BASE}/v1beta/${file.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': key } }).catch(() => {});
  }
}
