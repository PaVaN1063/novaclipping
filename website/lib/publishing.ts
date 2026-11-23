// Shared pieces every platform publisher uses.
import type { Batch, Clip, Db, Post } from './store';

export type PublishArgs = { post: Post; clip: Clip; batch: Batch; filePath: string };
export type PublishResult = { externalId: string; url?: string };

// What each platform must provide. See lib/publishers.ts for the list.
export type Publisher = {
  isConnected(db: Db): boolean;
  publish(args: PublishArgs): Promise<PublishResult>;
};

// Final text for a clip: AI writing when it's ready, your own title if you typed one.
export function finalText(clip: Clip, batch: Batch) {
  const ai = clip.ai?.status === 'done' ? clip.ai : null;
  const title = (!clip.titleEdited && ai?.title) || clip.title;
  const hashtags = ai?.hashtags.join(' ') || '';
  const description = [ai?.description, batch.caption, hashtags].filter((s) => s && s.trim()).join('\n\n');
  // Short-form caption for platforms without a separate title (Instagram, Threads…).
  const caption =
    ai?.igCaption ||
    [title, ai?.description, batch.caption, hashtags].filter((s) => s && s.trim()).join('\n\n');
  return { title, description, tags: ai?.tags ?? [], caption, hashtags };
}
