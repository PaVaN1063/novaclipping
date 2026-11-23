import { headers } from 'next/headers';
import LoginForm from './LoginForm';
import { quickAccessAllowed } from '@/lib/local';
import { safeNext } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const h = await headers();
  return <LoginForm next={safeNext(next)} quickAccess={quickAccessAllowed(h.get('host'))} />;
}
