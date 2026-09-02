'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

/**
 * Clears the MySQL-backed search history.
 *
 * On success it calls router.refresh() rather than filtering a local copy of
 * the list: the panel is server-rendered, so re-rendering it from the server is
 * both simpler and guaranteed to match what was actually deleted.
 */
export function ClearHistoryButton({
  label,
  clearedLabel,
}: {
  label: string;
  clearedLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cleared, setCleared] = useState(false);

  async function clearHistory(): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/searches`, { method: 'DELETE' });
      if (!response.ok) return;

      setCleared(true);
      startTransition(() => router.refresh());
    } catch {
      // Nothing useful to say: the list simply stays as it was.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void clearHistory()}
      disabled={isPending}
      className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
    >
      {cleared ? clearedLabel : label}
    </button>
  );
}
