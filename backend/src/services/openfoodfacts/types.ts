import type { Language } from './locales.js';

/**
 * The subset of an Open Food Facts product document we ask for and read.
 *
 * Everything is optional on purpose. Open Food Facts is crowd-sourced: a given
 * product may have a name but no brand, a photo but no nutriments, or a
 * nutriments object where every value is a string rather than a number. The
 * normalizer below is the only place allowed to assume anything.
 */
export interface OffRawProduct {
  code?: string;
  product_name?: string;
  generic_name?: string;
  ingredients_text?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  image_url?: string;
  categories_tags?: string[];
  labels_tags?: string[];
  countries_tags?: string[];
  nutriscore_grade?: string;
  nova_group?: number | string;
  ecoscore_grade?: string;
  nutriments?: Record<string, unknown>;
  last_modified_t?: number;
  // Localized variants arrive as product_name_nl, ingredients_text_de, ...
  [key: string]: unknown;
}

/**
 * Search-a-licious response. Note `hits` rather than `products`, and a `count`
 * that saturates at 10 000 (`is_count_exact` says whether it is a real total).
 */
export interface OffSearchResponse {
  hits?: OffRawProduct[];
  count?: number;
  is_count_exact?: boolean;
  page?: number;
  page_size?: number;
  page_count?: number;
}

export interface OffProductResponse {
  status?: number;
  status_verbose?: string;
  code?: string;
  product?: OffRawProduct;
}

/** A text value plus the language it actually came back in. */
export interface Localized {
  value: string;
  /** Null when the value came from an un-suffixed field of unknown language. */
  language: Language | null;
  /** True when we could not honour the requested language. */
  isFallback: boolean;
}

/** One nutrient, per 100g/100ml. */
export interface Nutrient {
  key: string;
  value: number;
  unit: string;
}

export interface NutritionFacts {
  /** Per 100 g or 100 ml, which is how Open Food Facts normalizes them. */
  per100g: Nutrient[];
  servingSize: string | null;
  nutriScore: string | null;
  novaGroup: number | null;
  ecoScore: string | null;
}

/** Fields everybody can see, subscription or not. */
export interface ProductSummary {
  code: string;
  name: Localized | null;
  genericName: Localized | null;
  brands: string[];
  imageUrl: string | null;
  thumbnailUrl: string | null;
  quantity: string | null;
  categories: string[];
  /** 0..1 — how much of the data we wanted was actually present. */
  completeness: number;
}

export interface ProductDetail extends ProductSummary {
  ingredients: Localized | null;
  labels: string[];
  countries: string[];
  /** Populated only for subscribers; null otherwise. */
  nutrition: NutritionFacts | null;
  /** True when nutrition was withheld because the user has no subscription. */
  nutritionLocked: boolean;
  /** True when Open Food Facts has no nutrition data for this product at all. */
  nutritionAvailable: boolean;
}
