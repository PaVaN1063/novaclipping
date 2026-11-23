import Link from 'next/link';
import { NovaMark } from '@/components/Icons';
import { safeNext } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  denied: 'This Google account is not allowed to use Nova Clipping.',
  expired: 'The sign-in took too long or was opened twice. Please try again.',
  google: 'Google could not confirm your account. Please try again.',
  setup: 'Google sign-in is not set up on this server yet.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const msg = error ? ERRORS[error] || 'Could not sign in. Please try again.' : '';
  return (
    <div className="auth">
      <div className="card auth-card">
        <Link href="/" className="brand">
          <NovaMark size={28} />
          <span>Nova Clipping</span>
        </Link>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display" style={{ fontSize: 28 }}>Sign in</h1>
          <p className="muted">Use your Google account to open the dashboard and Studio.</p>
        </div>
        {msg ? <p className="error" role="alert">{msg}</p> : null}
        <a className="btn btn-primary btn-lg" href={`/api/auth/google/start?next=${encodeURIComponent(safeNext(next))}`}>
          Continue with Google
        </a>
        <p className="hint" style={{ textAlign: 'center' }}>Only approved accounts can sign in.</p>
      </div>
    </div>
  );
}
