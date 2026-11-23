import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Sidebar from '@/components/Sidebar';
import { COOKIE, readSession } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const session = await readSession(store.get(COOKIE)?.value);

  return (
    <div className="shell">
      <Sidebar user={session?.user ?? 'guest'} />
      <main className="main">{children}</main>
    </div>
  );
}
