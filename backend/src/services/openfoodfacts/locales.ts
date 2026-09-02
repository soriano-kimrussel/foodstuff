/**
 * The four languages the assignment asks for. Kept in one place because both
 * the request validators and the Open Food Facts field-resolution logic have to
 * agree on the list, and the frontend mirrors it in src/i18n/config.ts.
 */
export const SUPPORTED_LANGUAGES = ['en', 'nl', 'de', 'fr'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Coerce anything (a query string, an Accept-Language fragment) to a supported
 * language, falling back to English. Accepts region tags like "nl-BE".
 */
export function toLanguage(value: unknown): Language {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE;

  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLanguage(base) ? base : DEFAULT_LANGUAGE;
}

/**
 * Order in which to look for a localized value: the requested language first,
 * then the product's own default, then English, then the remaining supported
 * languages. Returning *something* the user can read beats returning null, as
 * long as we also say which language it ended up being — see `Localized.language`.
 */
export function fallbackChain(preferred: Language): readonly (Language | null)[] {
  const rest = SUPPORTED_LANGUAGES.filter(
    (language) => language !== preferred && language !== DEFAULT_LANGUAGE,
  );
  // `null` marks the un-suffixed field, e.g. `product_name` rather than
  // `product_name_en`. Open Food Facts fills it with the product's main
  // language, which is often the only value present for regional items.
  return preferred === DEFAULT_LANGUAGE
    ? [preferred, null, ...rest]
    : [preferred, null, DEFAULT_LANGUAGE, ...rest];
}
