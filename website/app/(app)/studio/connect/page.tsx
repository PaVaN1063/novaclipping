import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readDb } from '@/lib/store';
import { ensureLinkKey, safeReturn } from '@/lib/studio';

export const dynamic = 'force-dynamic';

// One-click link from the Studio: its "connect" button opens this page (you
// are signed in here), and you are sent straight back with the link key.
export default async function StudioConnect({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const { return: back } = await searchParams;
  const db = await readDb();
  const target = safeReturn(back, db.prefs.studioUrl);
  if (!target) {
    return (
      <section className="card" style={{ gap: 12, maxWidth: 560 }}>
        <h1 style={{ fontSize: 22 }}>Can&apos;t link this Studio</h1>
        <p className="muted">The Studio address isn&apos;t one this site knows. Open Studio from this site&apos;s Studio page instead.</p>
      </section>
    );
  }
  const key = await ensureLinkKey();
  const h = await headers();
  const origin = (process.env.APP_URL || `${h.get('x-forwarded-proto') || 'http'}://${h.get('host') || 'localhost:3000'}`).replace(/\/+$/, '');
  const hash = new URLSearchParams({ 'nova-link': key, 'nova-site': origin }).toString();
  redirect(`${target.origin}${target.pathname}#${hash}`);
}
