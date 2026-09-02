/**
 * Internationalization, hand-rolled.
 *
 * Why not next-intl / react-intl: the app needs exactly three things — a
 * locale in the URL, a typed message catalogue, and a language selector. That
 * is roughly 80 lines here, it works in Server Components with no provider and
 * no client bundle, and every message key is checked by TypeScript because the
 * catalogues are objects rather than JSON blobs. The trade-off is that we do
 * not get ICU plural rules or date/number formatting helpers for free; where
 * this app needs them it uses Intl directly, which is what those libraries wrap
 * anyway. See README, "Internationalization approach".
 */

export const LOCALES = ['en', 'nl', 'de', 'fr'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Shown in the language selector, each in its own language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  nl: 'Nederlands',
  de: 'Deutsch',
  fr: 'Français',
};

/** BCP 47 tags for Intl.NumberFormat / Intl.DateTimeFormat. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-GB',
  nl: 'nl-NL',
  de: 'de-DE',
  fr: 'fr-FR',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Coerce anything to a supported locale. Accepts region tags like "de-AT". */
export function toLocale(value: unknown): Locale {
  if (typeof value !== 'string') return DEFAULT_LOCALE;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

/** Name of the cookie that remembers the manual selection. */
export const LOCALE_COOKIE = 'preferred-locale';
