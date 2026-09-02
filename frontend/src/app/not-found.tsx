import Link from 'next/link';
import { DEFAULT_LOCALE } from '@/i18n/config';

/**
 * Root-level 404. Reached for paths that never resolved to a locale, so it
 * cannot use the locale layout and has to emit its own document.
 */
export default function NotFound() {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="flex min-h-screen items-center justify-center bg-surface font-sans text-ink">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Page not found</h1>
          <Link
            href={`/${DEFAULT_LOCALE}`}
            className="mt-4 inline-block text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            Go to search
          </Link>
        </div>
      </body>
    </html>
  );
}
