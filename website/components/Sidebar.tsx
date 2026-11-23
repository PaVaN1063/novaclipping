'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import ThemeToggle from './ThemeToggle';
import { IconCalendar, IconGrid, IconLogout, IconScissors, IconSettings, IconUpload, NovaMark } from './Icons';

const links: { href: string; label: string; icon: ReactNode; badge?: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <IconGrid /> },
  { href: '/upload', label: 'Upload', icon: <IconUpload /> },
  { href: '/schedule', label: 'Schedule', icon: <IconCalendar /> },
  { href: '/studio', label: 'Studio', icon: <IconScissors /> },
  { href: '/settings', label: 'Settings', icon: <IconSettings /> },
];

export default function Sidebar({ user }: { user: string }) {
  const path = usePathname();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <nav className="sidebar" aria-label="App">
      <Link href="/" className="brand">
        <NovaMark />
        <span>Nova Clipping</span>
      </Link>

      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + '/');
        return (
          <Link key={l.href} href={l.href} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
            {l.icon}
            {l.label}
            {l.badge && !active ? <span className="chip chip-warn">{l.badge}</span> : null}
          </Link>
        );
      })}

      <div className="sidebar-foot">
        <ThemeToggle withLabel />
        <button type="button" className="nav-link" onClick={logout} disabled={busy} style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', width: '100%' }}>
          <IconLogout />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
        <div className="account">
          <span className="muted" style={{ fontSize: 12 }}>Signed in as</span>
          <span style={{ fontWeight: 500, color: 'var(--heading)' }}>{user}</span>
        </div>
      </div>
    </nav>
  );
}
