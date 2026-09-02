import { describe, expect, it } from 'vitest';
import {
  extractNutrition,
  humanizeTag,
  humanizeTags,
  parseBrands,
  pickLocalized,
  toNumber,
  toProductDetail,
  toProductSummary,
} from '../../src/services/openfoodfacts/normalize.js';
import { almostEmpty, frenchOnly, noBarcode, nutellaLike } from '../helpers/fixtures.js';

/**
 * The normalizer is where crowd-sourced data stops being unpredictable, so it
 * carries the densest tests in the suite. Everything here is pure — no network,
 * no database.
 */

describe('pickLocalized', () => {
  it('returns the requested language when it exists', () => {
    const result = pickLocalized(nutellaLike, 'product_name', 'de');
    expect(result).toEqual({
      value: 'Nutella Nuss-Nougat-Creme',
      language: 'de',
      isFallback: false,
    });
  });

  it('falls back and reports which language it actually used', () => {
    // The fixture has no Dutch name, so the un-suffixed field wins.
    const result = pickLocalized(frenchOnly, 'product_name', 'nl');

    expect(result?.value).toBe('Petit Beurre');
    expect(result?.isFallback).toBe(true);
  });

  it('reaches a non-default language rather than giving up', () => {
    // No Dutch and no English ingredients — French is the only one present.
    const result = pickLocalized(frenchOnly, 'ingredients_text', 'nl');

    expect(result?.language).toBe('fr');
    expect(result?.isFallback).toBe(true);
  });

  it('returns null when no variant exists at all', () => {
    expect(pickLocalized(almostEmpty, 'ingredients_text', 'en')).toBeNull();
  });

  it('treats a blank string as absent rather than as a value', () => {
    // almostEmpty has product_name: '' — an empty label would be worse than
    // the caller's own "Unnamed product" fallback.
    expect(pickLocalized(almostEmpty, 'product_name', 'en')).toBeNull();
  });
});

describe('toNumber', () => {
  it.each([
    ['12.5', 12.5],
    ['14,5', 14.5], // European decimal comma
    [42, 42],
    ['', null],
    ['unknown', null],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
  ])('parses %p as %p', (input, expected) => {
    expect(toNumber(input)).toBe(expected);
  });
});

describe('parseBrands', () => {
  it('splits a comma-separated list and drops duplicates', () => {
    expect(parseBrands('Ferrero, Nutella, Ferrero')).toEqual(['Ferrero', 'Nutella']);
  });

  it('returns an empty array for missing or blank input', () => {
    expect(parseBrands('')).toEqual([]);
    expect(parseBrands(undefined)).toEqual([]);
  });
});

describe('humanizeTag', () => {
  it('strips the language prefix and humanizes the slug', () => {
    expect(humanizeTag('en:breakfast-cereals')).toBe('Breakfast Cereals');
    expect(humanizeTag('fr:biscuits-secs')).toBe('Biscuits Secs');
  });

  it('leaves short words lowercase so tags read naturally', () => {
    expect(humanizeTag('en:pain-de-mie')).toBe('Pain de Mie');
  });

  it('ignores junk', () => {
    expect(humanizeTag('')).toBeNull();
    expect(humanizeTag(null)).toBeNull();
  });

  it('deduplicates and caps the list', () => {
    const tags = ['en:a-tag', 'fr:a-tag', 'en:b-tag'];
    // "a-tag" appears twice under different prefixes and must collapse.
    expect(humanizeTags(tags)).toEqual(['A Tag', 'B Tag']);
    expect(humanizeTags(['en:one', 'en:two', 'en:three'], 2)).toHaveLength(2);
  });
});

describe('extractNutrition', () => {
  it('reads well-formed nutriments', () => {
    const nutrition = extractNutrition(nutellaLike);

    expect(nutrition).not.toBeNull();
    expect(nutrition?.nutriScore).toBe('e');
    expect(nutrition?.novaGroup).toBe(4);
    expect(nutrition?.per100g).toContainEqual({ key: 'energyKcal', value: 539, unit: 'kcal' });
    expect(nutrition?.per100g).toContainEqual({ key: 'salt', value: 0.107, unit: 'g' });
  });

  it('coerces string numbers and skips unparseable ones', () => {
    const nutrition = extractNutrition(frenchOnly);

    expect(nutrition?.per100g).toContainEqual({ key: 'energyKcal', value: 450, unit: 'kcal' });
    expect(nutrition?.per100g).toContainEqual({ key: 'fat', value: 14.5, unit: 'g' });
    // salt_100g is '' and proteins_100g is 'unknown': both must be absent, not 0.
    expect(nutrition?.per100g.map((n) => n.key)).not.toContain('salt');
    expect(nutrition?.per100g.map((n) => n.key)).not.toContain('proteins');
  });

  it('normalizes an uppercase Nutri-Score and a string NOVA group', () => {
    const nutrition = extractNutrition(frenchOnly);
    expect(nutrition?.nutriScore).toBe('c');
    expect(nutrition?.novaGroup).toBe(3);
  });

  it('rejects an out-of-range Nutri-Score instead of passing it through', () => {
    const nutrition = extractNutrition({ ...nutellaLike, nutriscore_grade: 'z' });
    expect(nutrition?.nutriScore).toBeNull();
  });

  it('returns null when there is nothing at all', () => {
    expect(extractNutrition(almostEmpty)).toBeNull();
  });
});

describe('toProductSummary', () => {
  it('drops a product with no barcode', () => {
    expect(toProductSummary(noBarcode, 'en')).toBeNull();
  });

  it('scores a rich product as more complete than a bare one', () => {
    const rich = toProductSummary(nutellaLike, 'en');
    const bare = toProductSummary(almostEmpty, 'en');

    expect(rich?.completeness).toBeGreaterThan(0.8);
    expect(bare?.completeness).toBeLessThan(0.2);
  });

  it('survives a product where almost everything is missing', () => {
    const summary = toProductSummary(almostEmpty, 'en');

    expect(summary).not.toBeNull();
    expect(summary?.name).toBeNull();
    expect(summary?.brands).toEqual([]);
    expect(summary?.imageUrl).toBeNull();
    expect(summary?.categories).toEqual([]);
  });
});

describe('toProductDetail — the subscription gate', () => {
  it('omits nutrition entirely without a subscription', () => {
    const detail = toProductDetail(nutellaLike, 'en', false);

    expect(detail?.nutritionLocked).toBe(true);
    expect(detail?.nutrition).toBeNull();
    // The values must not travel to the client under any key.
    expect(JSON.stringify(detail)).not.toContain('539');
  });

  it('includes nutrition with a subscription', () => {
    const detail = toProductDetail(nutellaLike, 'en', true);

    expect(detail?.nutritionLocked).toBe(false);
    expect(detail?.nutrition?.per100g.length).toBeGreaterThan(0);
  });

  it('distinguishes "locked" from "no data exists"', () => {
    // Subscribed, but Open Food Facts has nothing for this product.
    const detail = toProductDetail(almostEmpty, 'en', true);

    expect(detail?.nutritionLocked).toBe(false);
    expect(detail?.nutritionAvailable).toBe(false);
    expect(detail?.nutrition).toBeNull();
  });

  it('still reports data availability while locked, so the UI can offer the upsell honestly', () => {
    const worthPaying = toProductDetail(nutellaLike, 'en', false);
    const notWorthPaying = toProductDetail(almostEmpty, 'en', false);

    expect(worthPaying?.nutritionAvailable).toBe(true);
    expect(notWorthPaying?.nutritionAvailable).toBe(false);
  });

  it('keeps free fields visible regardless of subscription', () => {
    const locked = toProductDetail(nutellaLike, 'en', false);

    expect(locked?.name?.value).toBe('Nutella hazelnut spread');
    expect(locked?.brands).toContain('Ferrero');
    expect(locked?.imageUrl).not.toBeNull();
  });
});
