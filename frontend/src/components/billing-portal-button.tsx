'use client';

import { useState } from 'react';
import type { Locale } from '@/i18n/config';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

/**
 * Opens Stripe's hosted billing portal, so a subscription can be cancelled from
 * inside the app rather than from the Stripe dashboard. Only rendered when the
 * user actually has a subscription to manage.
 */
export function BillingPortalButton({
  locale,
  label,
  errorLabel,
}: {
  locale: Locale;
  label: string;
  errorLabel: string;
}) {
  const [isPending, setIsPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openPortal(): Promise<void> {
    setIsPending(true);
    setFailed(false);

    try {
      const response = await fetch(`${BACKEND_URL}/api/billing/portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: locale }),
      });

      const body = (await response.json()) as { url?: string };

      if (!response.ok || !body.url) {
        setFailed(true);
        setIsPending(false);
        return;
      }

      window.location.assign(body.url);
    } catch {
      setFailed(true);
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void openPortal()}
      disabled={isPending}
      title={failed ? errorLabel : undefined}
      className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
    >
      {label}
    </button>
  );
}
