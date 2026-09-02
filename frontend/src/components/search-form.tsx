'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import type { Locale } from '@/i18n/config';

/**
 * The search box.
 *
 * Submitting navigates to ?q=… rather than fetching, which means results are
 * server-rendered, the URL is shareable, the back button works, and the whole
 * results page needs no client-side data fetching at all. The only reason this
 * is a Client Component is the pending state on the button.
 */
export function SearchForm({
  locale,
  initialTerm,
  placeholder,
  submitLabel,
  pendingLabel,
  tooShortLabel,
}: {
  locale: Locale;
  initialTerm: string;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  tooShortLabel: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(initialTerm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = term.trim();

    // Mirror of the backend's minimum. Checking here too saves a round-trip
    // and gives immediate feedback; the backend still validates, because a
    // client-side check is a convenience and never a guarantee.
    if (trimmed.length < 2) {
      setError(tooShortLabel);
      return;
    }

    setError(null);
    startTransition(() => {
      router.push(`/${locale}?q=${encodeURIComponent(trimmed)}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="w-full" role="search">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          name="q"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={error !== null}
          autoComplete="off"
          className="w-full rounded-md border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
