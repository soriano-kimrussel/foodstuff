'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from '@/i18n/config';

/**
 * The manual language selector.
 *
 * Switching languages rewrites the locale segment of the current URL and keeps
 * the rest of the path and the query string, so changing language on a search
 * results page re-runs the same search in the new language rather than dumping
 * the user back on the home page.
 *
 * A cookie records the choice so the middleware's redirect for a bare "/" and
 * any later visit honours it over Accept-Language.
 */
export function LanguageSelector({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale): void {
    if (next === locale) return;

    // One year, lax: it is a display preference, not a credential.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;

    // pathname always starts with /{locale} because of the middleware.
    const rest = pathname.replace(new RegExp(`^/${locale}`), '');

    // Read the query string from the URL rather than with useSearchParams().
    // That hook opts the whole subtree out of static rendering, and this
    // component sits in the layout — it would have forced every page to render
    // on demand. Inside a click handler `window` is always available and always
    // current, so the hook buys nothing here.
    const query = window.location.search;
    const target = `/${next}${rest}${query}`;

    startTransition(() => {
      router.push(target);
      // The Server Components above cache per-URL; refresh forces the new
      // language's data to be fetched rather than reusing the old render.
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      {LOCALES.map((option) => {
        const isActive = option === locale;
        return (
          <button
            key={option}
            type="button"
            onClick={() => switchTo(option)}
            disabled={isPending}
            aria-current={isActive ? 'true' : undefined}
            title={LOCALE_LABELS[option]}
            className={[
              'rounded px-2 py-1 text-xs font-medium uppercase transition-colors disabled:opacity-50',
              isActive
                ? 'bg-brand text-brand-ink'
                : 'text-muted hover:bg-line hover:text-ink',
            ].join(' ')}
          >
            {option}
            <span className="sr-only"> — {LOCALE_LABELS[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
