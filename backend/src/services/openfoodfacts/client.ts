import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { TtlCache } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import type { Language } from './locales.js';
import type { OffProductResponse, OffRawProduct, OffSearchResponse } from './types.js';

/**
 * HTTP access to Open Food Facts.
 *
 * This module owns every network detail — URLs, the required User-Agent, the
 * `fields` projection, timeouts and caching — and hands back raw documents.
 * Shaping them for the client is normalize.ts's job, which keeps the parsing
 * logic testable without a network.
 */

/**
 * Ask only for what we render. Open Food Facts documents are large (a full
 * product can exceed 100 kB); a search page of 24 of them is the difference
 * between a snappy response and a slow one.
 */
const SUMMARY_FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'quantity',
  'categories_tags',
  'image_front_url',
  'image_front_small_url',
  'image_url',
  'nutriscore_grade',
  'nova_group',
  'ecoscore_grade',
  'nutriments',
];

const DETAIL_ONLY_FIELDS = ['ingredients_text', 'serving_size', 'labels_tags', 'countries_tags'];

const LOCALIZED_BASES = ['product_name', 'generic_name', 'ingredients_text'];
const LANGUAGES: readonly Language[] = ['en', 'nl', 'de', 'fr'];

/**
 * Request every language variant in one go rather than one call per language.
 * The document is already being fetched; the extra fields are cheap and they
 * let normalize.ts run its fallback chain without a second round-trip.
 */
function localizedFieldNames(bases: readonly string[]): string[] {
  return bases.flatMap((base) => LANGUAGES.map((language) => `${base}_${language}`));
}

/** Search index: summary fields only — the detail page fetches the rest. */
const SEARCH_FIELD_PARAM = [
  ...SUMMARY_FIELDS,
  'completeness',
  ...localizedFieldNames(['product_name', 'generic_name']),
].join(',');

/** Product API: everything the detail page renders, in every language. */
const DETAIL_FIELD_PARAM = [
  ...SUMMARY_FIELDS,
  ...DETAIL_ONLY_FIELDS,
  ...localizedFieldNames(LOCALIZED_BASES),
].join(',');

export interface SearchParams {
  term: string;
  language: Language;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  products: OffRawProduct[];
  totalCount: number;
  /** False when `totalCount` is the index's 10 000 ceiling, not a real total. */
  isCountExact: boolean;
  page: number;
  pageSize: number;
}

const searchCache = new TtlCache<SearchResult>(env.OFF_CACHE_TTL_SECONDS * 1000);
const productCache = new TtlCache<OffRawProduct | null>(env.OFF_CACHE_TTL_SECONDS * 1000);

/** Exposed so tests can start from a known state. */
export function clearOffCaches(): void {
  searchCache.clear();
  productCache.clear();
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        // Open Food Facts' terms require a descriptive User-Agent; anonymous
        // clients get rate limited or blocked.
        'User-Agent': env.OFF_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(env.OFF_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    logger.warn('open food facts request failed', { label, error: String(error) });
    throw isTimeout
      ? HttpError.serviceUnavailable('Open Food Facts did not respond in time.')
      : HttpError.badGateway('Could not reach Open Food Facts.');
  }

  if (!response.ok) {
    logger.warn('open food facts returned an error status', { label, status: response.status });
    if (response.status === 429) {
      throw HttpError.serviceUnavailable('Open Food Facts is rate limiting us. Try again shortly.');
    }
    throw HttpError.badGateway(`Open Food Facts responded with ${response.status}.`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    // Open Food Facts occasionally serves an HTML error page with a 200.
    throw HttpError.badGateway('Open Food Facts returned a malformed response.');
  }
}

/**
 * Free-text product search, via Open Food Facts' Search-a-licious service.
 *
 * WHY NOT `/cgi/search.pl`: that is the endpoint most tutorials still show, and
 * it is the one this project used first. Open Food Facts now answers it with
 * 503 for anonymous full-text queries — it was retired in favour of the
 * Elasticsearch-backed service below. Verified against the live API on
 * 2 September 2026; see README, "Known limitations".
 *
 * WHY NOT `/api/v2/search`: v2 filters on structured tags (categories, labels,
 * barcodes) and has no free-text parameter at all, so it cannot answer "find me
 * products called chocolate".
 *
 * Note this is a different host to the product API, hence the separate base URL.
 */
export async function searchProducts(params: SearchParams): Promise<SearchResult> {
  const { term, language, page, pageSize } = params;

  const cacheKey = `${language}:${page}:${pageSize}:${term.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    logger.debug('open food facts search cache hit', { term, language, page });
    return cached;
  }

  const url = new URL('/search', env.OFF_SEARCH_BASE_URL);
  url.searchParams.set('q', term);
  // Restricts the query to the selected language's name fields, which is what
  // makes "chocolade" find Dutch products rather than English ones.
  url.searchParams.set('langs', language);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(pageSize));
  url.searchParams.set('fields', SEARCH_FIELD_PARAM);

  const body = await fetchJson<OffSearchResponse>(url.toString(), 'search');

  const result: SearchResult = {
    products: Array.isArray(body.hits) ? body.hits : [],
    // The index reports at most 10 000 and flags when that is a floor rather
    // than a total; the UI only ever shows it as an approximate figure.
    totalCount: typeof body.count === 'number' ? body.count : 0,
    isCountExact: body.is_count_exact !== false,
    page: typeof body.page === 'number' ? body.page : page,
    pageSize: typeof body.page_size === 'number' ? body.page_size : pageSize,
  };

  searchCache.set(cacheKey, result);
  return result;
}

/**
 * Fetch a single product by barcode. Resolves to null when Open Food Facts
 * knows nothing about the code, which the route turns into a 404.
 */
export async function fetchProduct(
  barcode: string,
  language: Language,
): Promise<OffRawProduct | null> {
  const cacheKey = `${language}:${barcode}`;
  const cached = productCache.get(cacheKey);
  if (cached !== undefined) {
    logger.debug('open food facts product cache hit', { barcode, language });
    return cached;
  }

  const url = new URL(`/api/v2/product/${encodeURIComponent(barcode)}.json`, env.OFF_BASE_URL);
  url.searchParams.set('fields', DETAIL_FIELD_PARAM);
  url.searchParams.set('lc', language);

  const body = await fetchJson<OffProductResponse>(url.toString(), 'product');

  // v2 signals "no such product" with status 0 and a 200 response.
  const product = body.status === 1 && body.product ? body.product : null;

  // Cache the miss too: a barcode that does not exist will not start existing
  // within the TTL, and scanning apps retry aggressively.
  productCache.set(cacheKey, product);
  return product;
}
