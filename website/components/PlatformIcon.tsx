import type { Platform } from '@/lib/platforms';
import { IconInstagram, IconYouTube } from './Icons';

// Icon per platform. A new platform without its own icon gets the generic share icon.
export default function PlatformIcon({ id, size = 18 }: { id: Platform | string; size?: number }) {
  if (id === 'youtube') return <IconYouTube size={size} />;
  if (id === 'instagram') return <IconInstagram size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
