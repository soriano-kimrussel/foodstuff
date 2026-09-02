import { fallbackChain, type Language } from './locales.js';
import type {
  Localized,
  Nutrient,
  NutritionFacts,
  OffRawProduct,
  ProductDetail,
  ProductSummary,
} from './types.js';

/**
 * Turning crowd-sourced Open Food Facts documents into something the UI can
 * render without defensive checks on every field.
 *
 * Two rules run through everything here:
 *   1. A field is either a usable value or null. No empty strings, no NaN, no
 *      "unknown" sentinels leaking to the client.
 *   2. When we substitute another language we say so, so the UI can label it.
 */

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve a localized Open Food Facts field.
 *
 * Open Food Facts stores `product_name_nl`, `product_name_de`, ... alongside a
 * bare `product_name` holding the product's own primary language. We walk the
 * fallback chain and report which link we landed on.
 */
export function pickLocalized(
  raw: OffRawProduct,
  base: string,
  preferred: Language,
): Localized | null {
  for (const language of fallbackChain(preferred)) {
    const key = language === null ? base : `${base}_${language}`;
    const value = cleanString(raw[key]);
    if (value === null) continue;

    return {
      value,
      language,
      isFallback: language !== preferred,
    };
  }

  return null;
}

/**
 * Brands, from either shape Open Food Facts uses.
 *
 * The product API returns a comma-separated string ("Nestlé, Nesquik"); the
 * search index returns an array. Accepting both keeps one normalizer for two
 * upstream endpoints.
 */
export function parseBrands(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.flatMap((entry) => cleanString(entry) ?? [])
    : (cleanString(value)?.split(',') ?? []);

  return Array.from(
    new Set(parts.map((brand) => brand.trim()).filter(Boolean)),
  );
}

/**
 * Open Food Facts tags look like "en:breakfast-cereals". The prefix is the
 * language the tag was *entered* in, not a translation we can request per
 * language, so we strip it and humanize the slug.
 *
 * This is a deliberate simplification, documented in the README: fully
 * localized category names would mean a second call to the taxonomy endpoint
 * per tag, which is not worth it for a demo.
 */
export function humanizeTag(tag: unknown): string | null {
  const cleaned = cleanString(tag);
  if (cleaned === null) return null;

  const withoutPrefix = cleaned.replace(/^[a-z]{2,3}:/i, '');
  const words = withoutPrefix.split('-').filter(Boolean);
  if (words.length === 0) return null;

  // Title case, but leave short particles ("de", "of", "au") lowercase so tags
  // read like prose. The first word is always capitalized regardless of length.
  return words
    .map((word, index) =>
      index === 0 || word.length > 2 ? word[0]!.toUpperCase() + word.slice(1) : word,
    )
    .join(' ');
}

export function humanizeTags(tags: unknown, limit = 8): string[] {
  if (!Array.isArray(tags)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const tag of tags) {
    const humanized = humanizeTag(tag);
    if (humanized === null || seen.has(humanized)) continue;
    seen.add(humanized);
    out.push(humanized);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Open Food Facts sometimes stores numbers as strings ("12.5"), sometimes with
 * a stray comma, and sometimes as an empty string meaning "not known".
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().replace(',', '.');
  if (normalized === '') return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The nutrients worth showing, in the order a European nutrition label prints
 * them. `key` is a stable identifier the frontend translates; we never send a
 * human-readable nutrient name from the backend, because that would bypass the
 * frontend's message catalogue.
 */
const NUTRIENT_SPECS: ReadonlyArray<{ key: string; offField: string; unit: string }> = [
  { key: 'energyKcal', offField: 'energy-kcal_100g', unit: 'kcal' },
  { key: 'fat', offField: 'fat_100g', unit: 'g' },
  { key: 'saturatedFat', offField: 'saturated-fat_100g', unit: 'g' },
  { key: 'carbohydrates', offField: 'carbohydrates_100g', unit: 'g' },
  { key: 'sugars', offField: 'sugars_100g', unit: 'g' },
  { key: 'fiber', offField: 'fiber_100g', unit: 'g' },
  { key: 'proteins', offField: 'proteins_100g', unit: 'g' },
  { key: 'salt', offField: 'salt_100g', unit: 'g' },
  { key: 'sodium', offField: 'sodium_100g', unit: 'g' },
];

const NUTRISCORE_GRADES = new Set(['a', 'b', 'c', 'd', 'e']);

export function extractNutrition(raw: OffRawProduct): NutritionFacts | null {
  const nutriments = (raw.nutriments ?? {}) as Record<string, unknown>;

  const per100g: Nutrient[] = [];
  for (const spec of NUTRIENT_SPECS) {
    const value = toNumber(nutriments[spec.offField]);
    if (value === null) continue;
    per100g.push({ key: spec.key, value, unit: spec.unit });
  }

  const grade = cleanString(raw.nutriscore_grade)?.toLowerCase() ?? null;
  const nutriScore = grade !== null && NUTRISCORE_GRADES.has(grade) ? grade : null;

  const novaRaw = toNumber(raw.nova_group);
  const novaGroup = novaRaw !== null && novaRaw >= 1 && novaRaw <= 4 ? Math.round(novaRaw) : null;

  const ecoGrade = cleanString(raw.ecoscore_grade)?.toLowerCase() ?? null;
  const ecoScore = ecoGrade !== null && NUTRISCORE_GRADES.has(ecoGrade) ? ecoGrade : null;

  const servingSize = cleanString(raw.serving_size);

  // Nothing usable at all — say so rather than shipping an empty panel.
  if (per100g.length === 0 && nutriScore === null && novaGroup === null && ecoScore === null) {
    return null;
  }

  return { per100g, servingSize, nutriScore, novaGroup, ecoScore };
}

/**
 * How much of what we asked for is actually present, 0..1. Drives the
 * "incomplete data" hint in the UI and lets the search endpoint sort
 * threadbare entries down without hiding them.
 */
export function scoreCompleteness(raw: OffRawProduct, summary: ProductSummary): number {
  const checks = [
    summary.name !== null,
    summary.brands.length > 0,
    summary.imageUrl !== null,
    summary.quantity !== null,
    summary.categories.length > 0,
    extractNutrition(raw) !== null,
  ];

  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100) / 100;
}

function pickImage(raw: OffRawProduct): { imageUrl: string | null; thumbnailUrl: string | null } {
  const full = cleanString(raw.image_front_url) ?? cleanString(raw.image_url);
  const thumb = cleanString(raw.image_front_small_url) ?? full;
  return { imageUrl: full, thumbnailUrl: thumb };
}

export function toProductSummary(raw: OffRawProduct, language: Language): ProductSummary | null {
  const code = cleanString(raw.code);
  // A product with no barcode cannot be linked to, so it is useless to us.
  if (code === null) return null;

  const { imageUrl, thumbnailUrl } = pickImage(raw);

  const summary: ProductSummary = {
    code,
    name: pickLocalized(raw, 'product_name', language),
    genericName: pickLocalized(raw, 'generic_name', language),
    brands: parseBrands(raw.brands),
    imageUrl,
    thumbnailUrl,
    quantity: cleanString(raw.quantity),
    categories: humanizeTags(raw.categories_tags),
    completeness: 0,
  };

  summary.completeness = scoreCompleteness(raw, summary);
  return summary;
}

/**
 * Build the detail payload.
 *
 * `hasSubscription` is the single gate. When it is false the nutrition object
 * is never constructed into the response at all — the values do not travel to
 * the client and get hidden with CSS, they are simply absent.
 */
export function toProductDetail(
  raw: OffRawProduct,
  language: Language,
  hasSubscription: boolean,
): ProductDetail | null {
  const summary = toProductSummary(raw, language);
  if (summary === null) return null;

  const nutrition = extractNutrition(raw);

  return {
    ...summary,
    ingredients: pickLocalized(raw, 'ingredients_text', language),
    labels: humanizeTags(raw.labels_tags, 12),
    countries: humanizeTags(raw.countries_tags, 6),
    nutritionAvailable: nutrition !== null,
    nutritionLocked: !hasSubscription,
    nutrition: hasSubscription ? nutrition : null,
  };
}
