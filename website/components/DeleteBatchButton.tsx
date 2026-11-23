'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconX } from './Icons';

export default function DeleteBatchButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete “${name}” and its clips from Nova Clipping? Anything already on YouTube or Instagram stays there.`)) return;
    setBusy(true);
    await fetch(`/api/batches/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <button type="button" className="icon-btn" aria-label={`Delete ${name}`} title="Delete batch" onClick={remove} disabled={busy}>
      <IconX />
    </button>
  );
}
