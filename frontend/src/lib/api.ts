import 'server-only';
import type {
  MeResponse,
  ProductResponse,
  RecentSearch,
  SearchResponse,
} from './types';
import type { Locale } from '@/i18n/config';

/**
 * Server-side access to the Express API.
 *
 * `server-only` at the top is load-bearing: importing this from a Client
 * Component becomes a build error. That is what guarantees the browser never
 * talks to the backend directly for product data, and therefore that the
 * subscription gate — which lives entirely in the backend — cannot be
 * sidestepped by reading a network response the client was not meant to have.
 */

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True when the backend never answered at all, as opposed to answering badly. */
  get isUnreachable(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
      // Product data changes rarely but the subscription flag must not be
      // cached across a checkout, so nothing here is cached by Next. The
      // backend already has a TTL cache in front of Open Food Facts, which is
      // the layer where caching actually belongs.
      cache: 'no-store',
    });
  } catch (error) {
    throw new ApiError(0, 'unreachable', `Could not reach the API at ${BASE_URL}: ${error}`);
  }

  if (!response.ok) {
    let code = 'unknown';
    let message = `The API responded with ${response.status}.`;

    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON error body; the defaults above are already reasonable.
    }

    throw new ApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}

export function searchProducts(
  term: string,
  locale: Locale,
  page = 1,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: term, lang: locale, page: String(page) });
  return request<SearchResponse>(`/api/products/search?${params}`);
}

export function getProduct(barcode: string, locale: Locale): Promise<ProductResponse> {
  const params = new URLSearchParams({ lang: locale });
  return request<ProductResponse>(`/api/products/${encodeURIComponent(barcode)}?${params}`);
}

export function getRecentSearches(): Promise<{ searches: RecentSearch[] }> {
  return request<{ searches: RecentSearch[] }>('/api/searches/recent');
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('/api/me');
}

/**
 * Read-only pages should degrade rather than 500 when a side panel's data is
 * unavailable. Callers that genuinely need the data let the error propagate.
 */
export async function safely<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}
