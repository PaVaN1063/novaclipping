// Every social platform Nova Clipping can post to, in one list.
// Pages, the upload form, Autopilot, the schedule and the worker all read from here,
// so adding a platform later (Threads, Facebook, TikTok…) means:
//   1. add an entry below,
//   2. write its publisher (like lib/instagram.ts) and add one line in lib/publishers.ts,
//   3. add its connect card in Settings.
// Nothing else needs to change.
// This file is safe to import in the browser (no secrets, no Node APIs).

export const PLATFORM_LIST = [
  {
    id: 'youtube',
    name: 'YouTube',
    tone: 'yt', // CSS colour key: chip-yt, toggle-btn.yt …
    // YouTube keeps a publish time itself, so videos are uploaded right away.
    nativeSchedule: true,
    // Drafts are real drafts on the platform (Private videos).
    nativeDrafts: true,
    draftNote: 'uploaded as Private — it sits in YouTube Studio like a draft until you publish.',
    scheduleNote: 'uploaded as Private with a publish time — YouTube makes it public on schedule.',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    tone: 'ig',
    // Instagram has no scheduling or drafts for apps: Nova holds the Reel and posts it on time.
    nativeSchedule: false,
    nativeDrafts: false,
    draftNote: 'Instagram has no drafts for apps — clips wait in your Nova queue instead.',
    scheduleNote: 'Nova Clipping holds the Reel and posts it at its slot.',
  },
] as const;

export type PlatformMeta = (typeof PLATFORM_LIST)[number];
export type Platform = PlatformMeta['id'];

export const PLATFORM_IDS = PLATFORM_LIST.map((p) => p.id) as Platform[];

export const platformMeta = Object.fromEntries(PLATFORM_LIST.map((p) => [p.id, p])) as Record<Platform, PlatformMeta>;

export const platformName = Object.fromEntries(PLATFORM_LIST.map((p) => [p.id, p.name])) as Record<Platform, string>;

export function isPlatform(v: unknown): v is Platform {
  return typeof v === 'string' && (PLATFORM_IDS as string[]).includes(v);
}

export const chipClass = (p: Platform) => `chip chip-${platformMeta[p].tone}`;

// Where a new post starts: platforms without real drafts keep drafts in the Nova queue.
export function startStatus(p: Platform, mode: 'draft' | 'schedule'): 'held' | 'queued' {
  return !platformMeta[p].nativeDrafts && mode === 'draft' ? 'held' : 'queued';
}
