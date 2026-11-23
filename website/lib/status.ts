import { platformMeta, platformName } from './platforms';
import type { Post } from './store';

export { platformName };

export type Tone = '' | 'ok' | 'warn' | 'accent' | 'danger';

export function postLabel(p: Post, now = Date.now()): { text: string; tone: Tone } {
  switch (p.status) {
    case 'waiting_file':
      return { text: 'Waiting for file', tone: 'warn' };
    case 'held':
      return { text: 'Held in Nova queue', tone: '' };
    case 'queued':
      return !platformMeta[p.platform].nativeSchedule && p.publishAt ? { text: 'Scheduled', tone: 'accent' } : { text: 'In queue', tone: 'accent' };
    case 'needs_connection':
      return { text: `Connect ${platformName[p.platform]} to send`, tone: 'warn' };
    case 'working':
      return { text: 'Sending…', tone: 'warn' };
    case 'failed':
      return { text: 'Failed', tone: 'danger' };
    case 'done':
      if (platformMeta[p.platform].nativeSchedule) {
        const name = platformName[p.platform];
        if (p.mode === 'draft') return { text: `Draft on ${name}`, tone: '' };
        if (p.publishAt && Date.parse(p.publishAt) > now) return { text: `Scheduled on ${name}`, tone: 'accent' };
        return { text: 'Published', tone: 'ok' };
      }
      return { text: 'Posted', tone: 'ok' };
  }
}

export function batchSummary(posts: Post[], now = Date.now()): { text: string; tone: Tone } {
  if (posts.length === 0) return { text: 'Empty', tone: '' };
  const count = (s: Post['status']) => posts.filter((p) => p.status === s).length;
  if (count('failed')) return { text: `${count('failed')} failed`, tone: 'danger' };
  if (count('waiting_file')) return { text: 'Files missing', tone: 'warn' };
  if (count('working')) return { text: 'Sending…', tone: 'warn' };
  if (count('needs_connection')) return { text: 'Waiting for connection', tone: 'warn' };
  if (count('queued')) return { text: 'Scheduled', tone: 'accent' };
  if (posts.some((p) => p.publishAt && Date.parse(p.publishAt) > now)) return { text: 'Scheduled', tone: 'accent' };
  if (posts.every((p) => p.mode === 'draft')) return { text: 'Saved as drafts', tone: '' };
  return { text: 'Published', tone: 'ok' };
}
