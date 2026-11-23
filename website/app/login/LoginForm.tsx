'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import { NovaMark } from '@/components/Icons';

export default function LoginForm({ next, quickAccess }: { next: string; quickAccess: boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || 'Could not sign in.');
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send({ username, password });
  }

  return (
    <div className="auth">
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>
      <form className="card auth-card" onSubmit={onSubmit}>
        <Link href="/" className="brand">
          <NovaMark size={28} />
          <span>Nova Clipping</span>
        </Link>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display" style={{ fontSize: 28 }}>Sign in</h1>
          <p className="muted">Sign in to open the dashboard and Studio.</p>
        </div>

        <label className="field">
          <span>Username</span>
          <input className="input" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error ? <p className="error" role="alert">{error}</p> : null}

        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {quickAccess ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="divider" style={{ flex: 1 }} />
              <span className="hint">or</span>
              <div className="divider" style={{ flex: 1 }} />
            </div>
            <button type="button" className="btn btn-ghost btn-lg" disabled={busy} onClick={() => send({ quick: true })}>
              Quick access (dev)
            </button>
            <p className="hint" style={{ textAlign: 'center' }}>Quick access skips the password. It only shows while running locally.</p>
          </>
        ) : null}
      </form>
    </div>
  );
}
