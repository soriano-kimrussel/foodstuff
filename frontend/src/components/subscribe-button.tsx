'use client';

import { useState } from 'react';
import type { Locale } from '@/i18n/config';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

/**
 * Starts Stripe Checkout.
 *
 * Client-side because it needs a click handler and a full-page redirect. It
 * only ever receives a URL from our backend and navigates to it — no price ids,
 * no keys, and no card data touch this component.
 */
export function SubscribeButton({
  locale,
  label,
  pendingLabel,
  errorLabel,
  className,
}: {
  locale: Locale;
  label: string;
  pendingLabel: string;
  errorLabel: string;
  className?: string;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(): Promise<void> {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/billing/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: locale }),
      });

      const body = (await response.json()) as
        | { url: string }
        | { error: { message: string } };

      if (!response.ok || !('url' in body)) {
        setError('error' in body ? body.error.message : errorLabel);
        setIsPending(false);
        return;
      }

      // Leaving the SPA entirely, so no need to clear the pending state.
      window.location.assign(body.url);
    } catch {
      setError(errorLabel);
      setIsPending(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void startCheckout()}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? pendingLabel : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
