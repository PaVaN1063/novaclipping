'use client';

import { useEffect, useState } from 'react';
import { IconMoon, IconSun } from './Icons';

type Theme = 'dark' | 'light';

export default function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === 'light' ? 'light' : 'dark');
  }, []);

  function flip() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('nova-theme', next);
    } catch {}
    setTheme(next);
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  if (withLabel) {
    return (
      <button type="button" className="nav-link" onClick={flip} style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', width: '100%' }}>
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>
    );
  }

  return (
    <button type="button" className="icon-btn" onClick={flip} aria-label={label} title={label}>
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}
