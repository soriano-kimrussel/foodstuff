import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SubscriptionStatus, type User } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { disconnect, resetDatabase, seedDemoUser } from '../helpers/db.js';
import { stubOpenFoodFacts, stubOpenFoodFactsFailure, type FetchStub } from '../helpers/off-stub.js';
import {
  almostEmpty,
  frenchOnly,
  noBarcode,
  nutellaLike,
  productPayload,
  searchIndexShape,
  searchPayload,
} from '../helpers/fixtures.js';

/**
 * End-to-end through Express, Prisma and a real MySQL schema, with only Open
 * Food Facts stubbed. This is the suite that proves the paywall actually holds
 * at the HTTP boundary — which is the only place it matters.
 */

const app = createApp();
let user: User;
let stub: FetchStub | null = null;

beforeAll(async () => {
  await resetDatabase();
});

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

async function giveActiveSubscription(): Promise<void> {
  await prisma.subscription.create({
    data: {
      userId: user.id,
      stripeSubscriptionId: `sub_test_${Date.now()}`,
      stripePriceId: 'price_test',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

describe('GET /api/products/search', () => {
  it('returns normalized products and records the search', async () => {
    stub = stubOpenFoodFacts([
      { match: '/search', body: searchPayload([nutellaLike, frenchOnly], 2) },
    ]);

    const response = await request(app).get('/api/products/search').query({ q: 'nutella', lang: 'en' });

    expect(response.status).toBe(200);
    expect(response.body.totalCount).toBe(2);
    expect(response.body.products).toHaveLength(2);
    expect(response.body.products[0].name.value).toBe('Nutella hazelnut spread');

    // The search must have been persisted to MySQL, not just returned.
    const stored = await prisma.search.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ term: 'nutella', language: 'en', resultCount: 2 });
  });

  it('asks Open Food Facts for the requested language', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    await request(app).get('/api/products/search').query({ q: 'nutella', lang: 'de' });

    expect(stub.calls[0]).toContain('langs=de');
    expect(stub.calls[0]).toContain('q=nutella');
  });

  it('returns product names in the selected language', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    const response = await request(app)
      .get('/api/products/search')
      .query({ q: 'nutella', lang: 'fr' });

    expect(response.body.products[0].name).toEqual({
      value: 'Nutella pâte à tartiner',
      language: 'fr',
      isFallback: false,
    });
  });

  it('drops results with no barcode and sorts sparse entries last', async () => {
    stub = stubOpenFoodFacts([
      { match: '/search', body: searchPayload([almostEmpty, noBarcode, nutellaLike], 3) },
    ]);

    const response = await request(app).get('/api/products/search').query({ q: 'test' });

    // noBarcode is unlinkable and must be gone; the rich product must lead.
    expect(response.body.products).toHaveLength(2);
    expect(response.body.products[0].code).toBe(nutellaLike.code);
    expect(response.body.products[1].code).toBe(almostEmpty.code);
  });


  it('accepts the array-shaped brands the search index returns', async () => {
    // The product API sends "A, B"; the search index sends ["A", "B"]. Both
    // have to normalize to the same array.
    stub = stubOpenFoodFacts([
      { match: '/search', body: searchPayload([searchIndexShape]) },
    ]);

    const response = await request(app)
      .get('/api/products/search')
      .query({ q: 'cola', lang: 'nl' });

    expect(response.body.products[0].brands).toEqual(['Coca-Cola', 'Coca-Cola Zero']);
    expect(response.body.products[0].name.value).toBe('Coca-Cola Zero Suiker');
  });

  it('reports when the result count is the index ceiling rather than a total', async () => {
    stub = stubOpenFoodFacts([
      { match: '/search', body: searchPayload([nutellaLike], 10_000, false) },
    ]);

    const response = await request(app).get('/api/products/search').query({ q: 'chocolate' });

    expect(response.body.totalCount).toBe(10_000);
    expect(response.body.isCountExact).toBe(false);
  });

  it('rejects a term that is too short, without calling upstream', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([]) }]);

    const response = await request(app).get('/api/products/search').query({ q: 'a' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
    expect(stub.calls).toHaveLength(0);
  });

  it('reports upstream failure as 502 rather than 500', async () => {
    stub = stubOpenFoodFactsFailure();

    const response = await request(app).get('/api/products/search').query({ q: 'nutella' });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('upstream_error');
  });

  it('moves a repeated search back to the top instead of duplicating it', async () => {
    stub = stubOpenFoodFacts([{ match: '/search', body: searchPayload([nutellaLike]) }]);

    await request(app).get('/api/products/search').query({ q: 'nutella', lang: 'en' });
    await request(app).get('/api/products/search').query({ q: 'nutella', lang: 'en' });

    const stored = await prisma.search.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
  });
});

describe('GET /api/products/:barcode — subscription gating', () => {
  const detailRoute = { match: '/api/v2/product/', body: productPayload(nutellaLike) };

  it('serves free fields but withholds nutrition without a subscription', async () => {
    stub = stubOpenFoodFacts([detailRoute]);

    const response = await request(app).get(`/api/products/${nutellaLike.code}`);

    expect(response.status).toBe(200);
    expect(response.body.hasSubscription).toBe(false);

    // Free.
    expect(response.body.product.name.value).toBeTruthy();
    expect(response.body.product.brands).toContain('Ferrero');
    expect(response.body.product.imageUrl).toBeTruthy();

    // Paid.
    expect(response.body.product.nutritionLocked).toBe(true);
    expect(response.body.product.nutrition).toBeNull();

    // The numbers must be absent from the payload entirely, not merely nulled
    // out under a key the client could dig into.
    expect(JSON.stringify(response.body)).not.toContain('539');
    expect(JSON.stringify(response.body)).not.toContain('nutriScore');
  });

  it('serves nutrition once the subscription is active', async () => {
    await giveActiveSubscription();
    stub = stubOpenFoodFacts([detailRoute]);

    const response = await request(app).get(`/api/products/${nutellaLike.code}`);

    expect(response.body.hasSubscription).toBe(true);
    expect(response.body.product.nutritionLocked).toBe(false);
    expect(response.body.product.nutrition.nutriScore).toBe('e');
    expect(response.body.product.nutrition.per100g).toContainEqual({
      key: 'energyKcal',
      value: 539,
      unit: 'kcal',
    });
  });

  it.each([
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.INCOMPLETE,
    SubscriptionStatus.UNPAID,
  ])('keeps nutrition locked while the subscription is %s', async (status) => {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId: `sub_${status}`,
        status,
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
    stub = stubOpenFoodFacts([detailRoute]);

    const response = await request(app).get(`/api/products/${nutellaLike.code}`);

    expect(response.body.product.nutritionLocked).toBe(true);
    expect(response.body.product.nutrition).toBeNull();
  });

  it('locks again once the paid period has elapsed', async () => {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId: 'sub_expired',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() - 1000),
      },
    });
    stub = stubOpenFoodFacts([detailRoute]);

    const response = await request(app).get(`/api/products/${nutellaLike.code}`);

    expect(response.body.product.nutritionLocked).toBe(true);
  });

  it('404s for a barcode Open Food Facts does not know', async () => {
    stub = stubOpenFoodFacts([{ match: '/api/v2/product/', body: productPayload(null) }]);

    const response = await request(app).get('/api/products/0000000000000');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('400s on a barcode that is not a barcode', async () => {
    const response = await request(app).get('/api/products/not-a-barcode');

    expect(response.status).toBe(400);
  });

  it('falls back to another language and says so', async () => {
    await giveActiveSubscription();
    stub = stubOpenFoodFacts([{ match: '/api/v2/product/', body: productPayload(frenchOnly) }]);

    const response = await request(app)
      .get(`/api/products/${frenchOnly.code}`)
      .query({ lang: 'nl' });

    expect(response.body.product.ingredients.language).toBe('fr');
    expect(response.body.product.ingredients.isFallback).toBe(true);
  });
});
