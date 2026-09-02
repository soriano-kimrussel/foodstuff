import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createTranslator } from '@/i18n';
import { isLocale } from '@/i18n/config';

export default async function BillingCancelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const { m } = createTranslator(locale);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h1 className="text-lg font-semibold">{m.billing.cancelTitle}</h1>
      <p className="mt-2 text-sm text-muted">{m.billing.cancelBody}</p>
      <Link
        href={`/${locale}`}
        className="mt-6 inline-flex rounded-md border border-line px-4 py-2 text-sm font-semibold hover:bg-raised"
      >
        {m.billing.cancelCta}
      </Link>
    </div>
  );
}
