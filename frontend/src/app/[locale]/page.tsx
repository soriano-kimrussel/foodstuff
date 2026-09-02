import { createTranslator } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import { getRecentSearches, safely, searchProducts, ApiError } from '@/lib/api';
import { SearchForm } from '@/components/search-form';
import { ProductCard } from '@/components/product-card';
import { RecentSearches } from '@/components/recent-searches';
import type { SearchResponse } from '@/lib/types';

/**
 * Search page.
 *
 * Server-rendered from `?q=`, so a results page is a real URL: shareable,
 * bookmarkable, back-button-correct, and rendered without any client-side
 * fetching. The only interactive parts are the input and the language buttons.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const { q } = await searchParams;
  // A repeated ?q= gives an array; take the first rather than crashing.
  const term = (Array.isArray(q) ? q[0] : q)?.trim() ?? '';

  const { m, t, formatNumber } = createTranslator(locale);

  let results: SearchResponse | null = null;
  let searchError: string | null = null;

  if (term.length >= 2) {
    try {
      results = await searchProducts(term, locale);
    } catch (error) {
      // Same reasoning as the product page: translate by code, never render
      // the backend's own English message into a localized page.
      searchError = !(error instanceof ApiError)
        ? m.search.error
        : error.isUnreachable
          ? m.errors.backendUnreachable
          : error.code === 'service_unavailable'
            ? m.errors.upstreamSlow
            : error.code === 'upstream_error'
              ? m.errors.upstreamUnavailable
              : m.search.error;
    }
  }

  // The history panel is decoration: never let it break the page.
  const { searches } = await safely(getRecentSearches(), { searches: [] });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {m.search.heading}
          </h1>
          <p className="mt-1 text-sm text-muted">{m.search.subheading}</p>
        </div>

        <SearchForm
          locale={locale}
          initialTerm={term}
          placeholder={m.search.placeholder}
          submitLabel={m.search.submit}
          pendingLabel={m.search.searching}
          tooShortLabel={m.search.tooShort}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          {searchError ? (
            <p role="alert" className="rounded-md border border-line bg-raised p-4 text-sm">
              {searchError}
            </p>
          ) : results === null ? (
            <p className="text-sm text-muted">{m.search.emptyState}</p>
          ) : results.products.length === 0 ? (
            <div className="rounded-md border border-line bg-raised p-6 text-center">
              <p className="text-sm font-medium">{t(m.search.noResults, { term })}</p>
              <p className="mt-1 text-sm text-muted">{m.search.noResultsHint}</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{t(m.search.resultsFor, { term })}</h2>
                <p className="text-xs text-muted">
                  {t(m.search.resultCount, { count: formatNumber(results.totalCount) })}
                </p>
              </div>

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {results.products.map((product) => (
                  <li key={product.code} className="flex">
                    <ProductCard product={product} locale={locale} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <RecentSearches searches={searches} locale={locale} />
        </aside>
      </div>
    </div>
  );
}
