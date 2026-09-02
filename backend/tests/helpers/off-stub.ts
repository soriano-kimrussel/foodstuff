import { vi } from 'vitest';
import { clearOffCaches } from '../../src/services/openfoodfacts/client.js';

/**
 * Stub Open Food Facts.
 *
 * The tests must not depend on a third-party service being up, fast, or
 * returning the same products next month. Stubbing at `fetch` rather than at
 * our own client module means the URL building, the User-Agent header, the
 * `fields` projection and the response parsing all still execute — only the
 * network is replaced.
 */

export interface StubRoute {
  /** Substring matched against the request URL. */
  match: string;
  status?: number;
  body: unknown;
}

export interface FetchStub {
  /** Every URL requested, in order. Lets a test assert on query parameters. */
  calls: string[];
  restore: () => void;
}

export function stubOpenFoodFacts(routes: StubRoute[]): FetchStub {
  const calls: string[] = [];

  const impl = vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    const route = routes.find((candidate) => url.includes(candidate.match));
    if (!route) {
      throw new Error(`No Open Food Facts stub matched ${url}`);
    }

    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', impl);
  clearOffCaches();

  return {
    calls,
    restore: () => {
      vi.unstubAllGlobals();
      clearOffCaches();
    },
  };
}

/** Simulate the upstream being unreachable. */
export function stubOpenFoodFactsFailure(error: Error = new Error('network down')): FetchStub {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw error;
    }),
  );
  clearOffCaches();

  return { calls: [], restore: () => { vi.unstubAllGlobals(); clearOffCaches(); } };
}
