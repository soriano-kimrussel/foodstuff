import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { LOCALES, isLocale, type Locale } from '@/i18n/config';
import { getMessages } from '@/i18n';
import { getMe, safely } from '@/lib/api';
import { SiteHeader } from '@/components/site-header';

/**
 * Pre-render all four locales at build time. The set is small and closed, so
 * there is no reason to generate them on demand.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const m = getMessages(locale);
  return {
    title: m.meta.title,
    description: m.meta.description,
    // Tell crawlers (and the browser) about the other language versions.
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // The middleware only redirects paths without a locale; a hand-typed /es/…
  // still reaches this layout and must 404 rather than render in English.
  if (!isLocale(locale)) notFound();
  const typedLocale: Locale = locale;

  // The header shows subscription state. If the API is down the page should
  // still render — the search box will report the failure itself.
  const me = await safely(getMe(), null);

  return (
    <html lang={typedLocale} suppressHydrationWarning>
      <body className="min-h-screen bg-surface font-sans text-ink antialiased">
        <SiteHeader locale={typedLocale} subscription={me?.subscription ?? null} />
        <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6">{children}</main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-xs text-muted sm:px-6">
          <p>
            Product data from{' '}
            <a
              className="underline underline-offset-2 hover:text-ink"
              href="https://world.openfoodfacts.org"
              rel="noreferrer noopener"
              target="_blank"
            >
              Open Food Facts
            </a>
            , licensed under the Open Database License.
          </p>
        </footer>
      </body>
    </html>
  );
}
