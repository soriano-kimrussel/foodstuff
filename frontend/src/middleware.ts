import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale, toLocale } from './i18n/config';

/**
 * Every page lives under /{locale}/…, so the locale is in the URL and a page is
 * shareable in the language it was read in. This middleware only handles paths
 * that have no locale segment yet.
 *
 * Preference order for the redirect target:
 *   1. the cookie set by the language selector — an explicit manual choice
 *   2. Accept-Language — a reasonable first guess for a new visitor
 *   3. English
 *
 * The assignment asks for a *manual* selector, so the cookie always beats the
 * browser header; automatic detection never overrides a choice the user made.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : preferredFromHeader(request.headers.get('accept-language'));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

/** Parse Accept-Language and pick the highest-weighted supported language. */
function preferredFromHeader(header: string | null): string {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const quality = q ? Number.parseFloat(q.split('=')[1] ?? '1') : 1;
      return { tag: tag ?? '', quality: Number.isFinite(quality) ? quality : 0 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const candidate = toLocale(tag);
    // toLocale falls back to English for anything unsupported, so only accept
    // it when the header really did ask for a language we have.
    if (candidate !== DEFAULT_LOCALE || tag.toLowerCase().startsWith('en')) {
      return candidate;
    }
  }

  return DEFAULT_LOCALE;
}

export const config = {
  // Skip Next internals, the API proxy, and anything that looks like a file.
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
