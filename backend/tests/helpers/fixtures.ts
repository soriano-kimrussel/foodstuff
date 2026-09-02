import type { OffRawProduct } from '../../src/services/openfoodfacts/types.js';

/**
 * Open Food Facts documents, trimmed to the fields we request.
 *
 * Shaped from real API responses, including their inconsistencies: numbers
 * arriving as strings, tags carrying a language prefix, and localized fields
 * that exist for some languages but not others. Fixtures that are tidier than
 * production data test nothing worth testing.
 */

/** Well-populated product with names in all four languages. */
export const nutellaLike: OffRawProduct = {
  code: '3017624010701',
  product_name: 'Nutella',
  product_name_en: 'Nutella hazelnut spread',
  product_name_nl: 'Nutella hazelnootpasta',
  product_name_de: 'Nutella Nuss-Nougat-Creme',
  product_name_fr: 'Nutella pâte à tartiner',
  generic_name_en: 'Hazelnut spread with cocoa',
  ingredients_text_en: 'Sugar, palm oil, hazelnuts 13%, skimmed milk powder, fat-reduced cocoa 7.4%',
  ingredients_text_de: 'Zucker, Palmöl, Haselnüsse 13 %, Magermilchpulver, fettarmer Kakao 7,4 %',
  brands: 'Ferrero, Nutella',
  quantity: '400 g',
  serving_size: '15 g',
  categories_tags: ['en:spreads', 'en:sweet-spreads', 'en:hazelnut-spreads'],
  labels_tags: ['en:palm-oil'],
  countries_tags: ['en:france', 'en:germany'],
  image_front_url: 'https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.400.jpg',
  image_front_small_url:
    'https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.200.jpg',
  nutriscore_grade: 'e',
  nova_group: 4,
  ecoscore_grade: 'd',
  nutriments: {
    'energy-kcal_100g': 539,
    fat_100g: 30.9,
    'saturated-fat_100g': 10.6,
    carbohydrates_100g: 57.5,
    sugars_100g: 56.3,
    fiber_100g: 0,
    proteins_100g: 6.3,
    salt_100g: 0.107,
    sodium_100g: 0.0428,
  },
};

/**
 * A product that only exists in French — the case the language fallback chain
 * is actually for. Numbers are strings with comma decimals, as OFF often
 * stores them.
 */
export const frenchOnly: OffRawProduct = {
  code: '3175680011480',
  product_name: 'Petit Beurre',
  product_name_fr: 'Véritable Petit Beurre',
  ingredients_text_fr: 'Farine de blé, sucre, beurre concentré, lait écrémé en poudre',
  brands: 'LU',
  quantity: '200 g',
  categories_tags: ['fr:biscuits-secs', 'en:biscuits'],
  image_front_url: 'https://images.openfoodfacts.org/images/products/petit-beurre.jpg',
  nutriscore_grade: 'C',
  nova_group: '3',
  nutriments: {
    'energy-kcal_100g': '450',
    fat_100g: '14,5',
    sugars_100g: '22',
    salt_100g: '',
    proteins_100g: 'unknown',
  },
};

/** Barely-there entry: a barcode and nothing else worth showing. */
export const almostEmpty: OffRawProduct = {
  code: '0000000000017',
  product_name: '',
  brands: '',
  nutriments: {},
};

/** No barcode at all — must be dropped, because it cannot be linked to. */
export const noBarcode: OffRawProduct = {
  product_name: 'Ghost product',
  brands: 'Nobody',
};

/**
 * Search-a-licious response envelope: `hits`, not `products`, and a `count`
 * that saturates at 10 000.
 */

/**
 * A hit as the *search index* returns it: brands as an array rather than a
 * comma-separated string, and a `completeness` score supplied upstream. The two
 * Open Food Facts endpoints disagree on this shape, so both are tested.
 */
export const searchIndexShape: OffRawProduct = {
  code: '5000112637922',
  product_name: 'Coca-Cola Zero',
  product_name_nl: 'Coca-Cola Zero Suiker',
  brands: ['Coca-Cola', 'Coca-Cola Zero'] as unknown as string,
  categories_tags: ['en:beverages', 'en:sodas'],
  image_front_small_url: 'https://images.openfoodfacts.org/images/products/cola.200.jpg',
  nutriscore_grade: 'b',
  nutriments: { 'energy-kcal_100g': 0.3, sugars_100g: 0 },
};

export function searchPayload(hits: OffRawProduct[], count = hits.length, isExact = true) {
  return { hits, count, is_count_exact: isExact, page: 1, page_size: 24, page_count: 1 };
}

export function productPayload(product: OffRawProduct | null) {
  return product === null
    ? { status: 0, status_verbose: 'product not found' }
    : { status: 1, code: product.code, product };
}
