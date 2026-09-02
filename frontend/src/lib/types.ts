/**
 * Mirrors of the backend response shapes.
 *
 * Hand-written rather than shared through a package: the two apps are deployed
 * separately and a generated client would be more machinery than a test project
 * warrants. The trade-off is that these can drift from the backend — the
 * integration tests on the backend side are what stop that mattering silently.
 */

export interface Localized {
  value: string;
  language: string | null;
  isFallback: boolean;
}

export interface Nutrient {
  key: string;
  value: number;
  unit: string;
}

export interface NutritionFacts {
  per100g: Nutrient[];
  servingSize: string | null;
  nutriScore: string | null;
  novaGroup: number | null;
  ecoScore: string | null;
}

export interface ProductSummary {
  code: string;
  name: Localized | null;
  genericName: Localized | null;
  brands: string[];
  imageUrl: string | null;
  thumbnailUrl: string | null;
  quantity: string | null;
  categories: string[];
  completeness: number;
}

export interface ProductDetail extends ProductSummary {
  ingredients: Localized | null;
  labels: string[];
  countries: string[];
  nutrition: NutritionFacts | null;
  nutritionLocked: boolean;
  nutritionAvailable: boolean;
}

export interface SearchResponse {
  query: string;
  language: string;
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  hasSubscription: boolean;
  products: ProductSummary[];
}

export interface ProductResponse {
  language: string;
  hasSubscription: boolean;
  product: ProductDetail;
}

export interface RecentSearch {
  id: string;
  term: string;
  language: string;
  resultCount: number;
  createdAt: string;
}

export interface SubscriptionView {
  isActive: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface MeResponse {
  user: { id: string; email: string; name: string | null };
  subscription: SubscriptionView;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
