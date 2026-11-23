// The list of publishers, one per platform in lib/platforms.ts.
// To add a platform: write its publisher (like lib/instagram.ts) and add one line here.
import type { Platform } from './platforms';
import type { Publisher } from './publishing';
import { youtubePublisher } from './youtube';
import { instagramPublisher } from './instagram';

export type { Publisher, PublishArgs, PublishResult } from './publishing';
export { finalText } from './publishing';

export const publishers: Record<Platform, Publisher> = {
  youtube: youtubePublisher,
  instagram: instagramPublisher,
};
