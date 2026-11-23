'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Re-reads the page every few seconds while something is still in progress.
export function AutoRefresh({ active, seconds = 5 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}

export function RetryButton({ id, label = 'Retry failed' }: { id: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    await fetch(`/api/batches/${id}/retry`, { method: 'POST' });
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" className="btn btn-primary" style={{ fontSize: 14 }} onClick={retry} disabled={busy}>
      {busy ? 'Retrying…' : label}
    </button>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ fontSize: 13, minHeight: 36, padding: '0 12px' }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}
