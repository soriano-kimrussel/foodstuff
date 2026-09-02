import Link from 'next/link';
import { createTranslator } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { RecentSearch } from '@/lib/types';

/**
 * The MySQL-backed search history. Each entry links back to the search that
 * produced it, in the language it was originally run in — which is why the row
 * stores `language` alongside the term.
 */
export function RecentSearches({
  searches,
  locale,
}: {
  searches: RecentSearch[];
  locale: Locale;
}) {
  const { m, t, formatNumber } = createTranslator(locale);

  return (
    <section aria-labelledby="recent-heading" className="rounded-lg border border-line bg-raised p-4">
      <h2 id="recent-heading" className="text-xs font-semibold uppercase tracking-wide text-muted">
        {m.recent.heading}
      </h2>

      {searches.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{m.recent.empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {searches.map((search) => (
            <li key={search.id}>
              <Link
                href={`/${locale}?q=${encodeURIComponent(search.term)}`}
                className="flex items-baseline justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-surface"
              >
                <span className="truncate">{search.term}</span>
                <span className="shrink-0 text-xs text-muted">
                  {t(m.recent.resultCount, { count: formatNumber(search.resultCount) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
