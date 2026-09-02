import { LOCALE_TAGS, type Locale } from './config';
import en, { type Messages } from './messages/en';
import nl from './messages/nl';
import de from './messages/de';
import fr from './messages/fr';

/**
 * All four catalogues are imported statically rather than dynamically loaded.
 *
 * They are a few kilobytes each and they only ever run on the server (every
 * component that translates is a Server Component), so there is no client
 * bundle to split. A static import also means a typo in a locale key is a build
 * error instead of a 404 at request time.
 */
const CATALOGUES: Record<Locale, Messages> = { en, nl, de, fr };

export function getMessages(locale: Locale): Messages {
  return CATALOGUES[locale];
}

/**
 * Substitute {placeholders}. Deliberately minimal — no ICU, no plural rules.
 * The catalogues avoid constructions that need them; where a real plural is
 * required the caller formats the number with Intl and passes it in.
 */
export function interpolate(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * A translator bound to one locale. `t` takes an already-resolved string from
 * the catalogue, so callers write `t(m.search.resultsFor, { term })` and keep
 * full type-checking on the key path — a string-key API like `t('search.x')`
 * would throw that away.
 */
export interface Translator {
  locale: Locale;
  m: Messages;
  t: (template: string, values?: Record<string, string | number>) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string;
}

export function createTranslator(locale: Locale): Translator {
  const tag = LOCALE_TAGS[locale];

  return {
    locale,
    m: getMessages(locale),
    t: (template, values) => interpolate(template, values),
    formatNumber: (value, options) => new Intl.NumberFormat(tag, options).format(value),
    formatDate: (value, options) =>
      new Intl.DateTimeFormat(tag, options ?? { dateStyle: 'medium' }).format(
        typeof value === 'string' ? new Date(value) : value,
      ),
  };
}

/** Language names in the *current* locale, for the "shown in X" notice. */
export function languageName(language: string, inLocale: Locale): string {
  try {
    const display = new Intl.DisplayNames([LOCALE_TAGS[inLocale]], { type: 'language' });
    return display.of(language) ?? language;
  } catch {
    return language;
  }
}

export type { Messages };
