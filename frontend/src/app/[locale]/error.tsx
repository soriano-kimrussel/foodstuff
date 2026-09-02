'use client';

import { useParams } from 'next/navigation';
import { getMessages } from '@/i18n';
import { toLocale } from '@/i18n/config';

/**
 * Last-resort boundary for genuinely unexpected render errors.
 *
 * Expected failures — a missing product, a slow upstream, an unreachable API —
 * are handled where they happen and never reach this. Anything that does get
 * here is a bug, so the copy stays generic and offers a retry rather than
 * guessing at a cause.
 */
export default function LocaleError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams();
  const locale = toLocale(params?.locale);
  const m = getMessages(locale);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">{m.errors.generic}</h1>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:opacity-90"
      >
        {m.errors.retry}
      </button>
    </div>
  );
}
