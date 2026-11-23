// Sample data so the screens look real until YouTube / Instagram are connected.

export type Where = 'yt' | 'ig' | 'both';

export const stats = [
  { label: 'Scheduled', value: '14', note: 'Next 7 days' },
  { label: 'Drafts on YouTube', value: '9', note: 'Private, waiting for you' },
  { label: 'Uploading now', value: '3', note: 'Batch “Ranked highlights”' },
  { label: 'Published', value: '42', note: 'This month' },
];

export const upNext: { title: string; when: string; where: Where }[] = [
  { title: '1v4 clutch nobody saw coming', when: 'Today · 9:00 PM', where: 'both' },
  { title: 'Insane flick shot', when: 'Tomorrow · 12:00 AM', where: 'yt' },
  { title: 'Last-second defuse', when: 'Sat 21 Nov · 6:00 PM', where: 'both' },
  { title: 'He did NOT expect that', when: 'Sat 21 Nov · 9:00 PM', where: 'ig' },
  { title: 'Funniest fail this week', when: 'Sun 22 Nov · 12:00 PM', where: 'both' },
];

export const batches = [
  { name: 'Ranked highlights', clips: 6, mode: 'Scheduled · every 3 h', where: 'YouTube, Instagram', status: 'Uploading 3 of 6', tone: 'warn' },
  { name: 'Weekend montage', clips: 8, mode: 'Scheduled · every 6 h', where: 'YouTube', status: 'Scheduled', tone: 'accent' },
  { name: 'Fails & funnies', clips: 9, mode: 'Draft', where: 'YouTube', status: 'Saved as drafts', tone: '' },
  { name: 'Best of last week', clips: 5, mode: 'Scheduled · every 12 h', where: 'YouTube, Instagram', status: 'Published', tone: 'ok' },
];

const P = (time: string, title: string, where: Where) => ({ time, title, where });

export const week = [
  { dow: 'Mon', num: '23', today: true, posts: [P('6:00 PM', '1v4 clutch nobody saw coming', 'both'), P('9:00 PM', 'Insane flick shot', 'yt')] },
  { dow: 'Tue', num: '24', posts: [P('12:00 PM', 'Last-second defuse', 'both'), P('6:00 PM', 'He did NOT expect that', 'ig'), P('9:00 PM', 'Ace in 12 seconds', 'yt')] },
  { dow: 'Wed', num: '25', posts: [P('6:00 PM', 'Funniest fail this week', 'both')] },
  { dow: 'Thu', num: '26', posts: [P('12:00 PM', 'Wallbang into a 3k', 'yt'), P('6:00 PM', 'Team wipe in 5 seconds', 'both')] },
  { dow: 'Fri', num: '27', posts: [P('6:00 PM', 'Ranked comeback', 'both'), P('9:00 PM', 'Best of the week', 'yt')] },
  { dow: 'Sat', num: '28', posts: [P('12:00 PM', 'Weekend montage pt. 1', 'both'), P('6:00 PM', 'Weekend montage pt. 2', 'both')] },
  { dow: 'Sun', num: '29', posts: [P('6:00 PM', 'Viewer clip of the week', 'ig')] },
];

export const whereLabel: Record<Where, string> = { yt: 'YouTube', ig: 'Instagram', both: 'YouTube + Instagram' };
