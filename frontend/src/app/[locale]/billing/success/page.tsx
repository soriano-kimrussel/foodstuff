import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createTranslator } from '@/i18n';
import { isLocale } from '@/i18n/config';

/**
 * Where Stripe Checkout returns after a successful payment.
 *
 * Deliberately does NOT grant access itself — it only reports what the webhook
 * is expected to have done. Trusting a redirect the user's browser performed
 * would let anyone unlock the paywall by visiting this URL; entitlement comes
 * from the webhook writing to MySQL and nowhere else. That is also why the copy
 * mentions a possible few-second delay.
 */
export default async function BillingSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const { m } = createTranslator(locale);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-2xl text-brand">
        ✓
      </div>
      <h1 className="mt-4 text-lg font-semibold">{m.billing.successTitle}</h1>
      <p className="mt-2 text-sm text-muted">{m.billing.successBody}</p>
      <Link
        href={`/${locale}`}
        className="mt-6 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:opacity-90"
      >
        {m.billing.successCta}
      </Link>
    </div>
  );
}
