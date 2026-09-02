import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { User } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { disconnect, resetDatabase, seedDemoUser } from '../helpers/db.js';
import { stubOpenFoodFacts, type FetchStub } from '../helpers/off-stub.js';
import { nutellaLike, searchPayload } from '../helpers/fixtures.js';

/**
 * Recent-search history — the "store recent searches in MySQL" requirement.
 */

const app = createApp();
let user: User;
let stub: FetchStub | null = null;

beforeEach(async () => {
  await resetDatabase();
  user = await seedDemoUser();
});

afterEach(() => {
  stub?.restore();
  stub = null;
});

afterAll(async () => {
  await disconnect();
});

async function runSearch(term: string, lang = 'en'): Promise<void> {
  await request(app).get('/api/products/search').query({ q: term, lang });
}

describe('GET /api/searches/recent', () => {
  it('starts empty', async () => {
    const response = await request(app).get('/api/searches/recent');

    expect(response.status).toBe(200);
    expect(response.body.searches).toEqual([]);
  });

  it('returns searches newest first', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    await runSearch('first');
    await runSearch('second');
    await runSearch('third');

    const response = await request(app).get('/api/searches/recent');

    expect(response.body.searches.map((s: { term: string }) => s.term)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });

  it('records the language each search ran in', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    await runSearch('chocolat', 'fr');

    const response = await request(app).get('/api/searches/recent');
    expect(response.body.searches[0]).toMatchObject({ term: 'chocolat', language: 'fr' });
  });

  it('treats the same term in two languages as two entries', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    await runSearch('cacao', 'fr');
    await runSearch('cacao', 'nl');

    const stored = await prisma.search.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(2);
  });

  it('caps the list at ten', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    for (let i = 0; i < 13; i += 1) {
      await runSearch(`term-${i}`);
    }

    const response = await request(app).get('/api/searches/recent');

    expect(response.body.searches).toHaveLength(10);
    expect(response.body.searches[0].term).toBe('term-12');
  });

  it('does not record a search that failed validation', async () => {
    await request(app).get('/api/products/search').query({ q: 'x' });

    expect(await prisma.search.count()).toBe(0);
  });
});

describe('DELETE /api/searches', () => {
  it('clears the history and reports how many rows went', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    await runSearch('one');
    await runSearch('two');

    const response = await request(app).delete('/api/searches');

    expect(response.status).toBe(200);
    expect(response.body.deleted).toBe(2);
    expect(await prisma.search.count()).toBe(0);
  });
});

describe('GET /api/me', () => {
  it('reports the demo user with the paywall closed', async () => {
    const response = await request(app).get('/api/me');

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(user.email);
    expect(response.body.subscription).toEqual({
      isActive: false,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    // Stripe ids are account data the frontend has no use for.
    expect(response.body.user).not.toHaveProperty('stripeCustomerId');
  });

  it('reports 503 with actionable advice when the database has not been seeded', async () => {
    await resetDatabase();

    const response = await request(app).get('/api/me');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('demo_user_missing');
    expect(response.body.error.message).toContain('npm run seed');
  });
});

describe('unknown routes', () => {
  it('404s with a JSON body rather than Express HTML', async () => {
    const response = await request(app).get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});
