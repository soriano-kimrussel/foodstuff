import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { attachDemoUser, requireUser } from '../middleware/demo-user.js';
import { HttpError } from '../lib/http-error.js';
import { fetchProduct, searchProducts } from '../services/openfoodfacts/client.js';
import { toProductDetail, toProductSummary } from '../services/openfoodfacts/normalize.js';
import { SUPPORTED_LANGUAGES, toLanguage } from '../services/openfoodfacts/locales.js';
import { userHasActiveSubscription } from '../services/subscription.service.js';
import { recordSearch } from '../services/search.service.js';
import type { ProductSummary } from '../services/openfoodfacts/types.js';

export const productsRouter = Router();

const languageSchema = z
  .enum(SUPPORTED_LANGUAGES)
  .default('en')
  .catch('en');

const searchQuerySchema = z.object({
  // Open Food Facts returns noise for a single character, and an empty term
  // would return the whole database.
  q: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters.')
    .max(191, 'Search term is too long.'),
  lang: languageSchema,
  page: z.coerce.number().int().min(1).max(50).default(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24).catch(24),
});

// Barcodes are numeric, 8-14 digits (EAN-8 through GTIN-14).
const barcodeSchema = z.string().regex(/^\d{6,14}$/, 'That is not a valid barcode.');

/**
 * GET /api/products/search
 *
 * Public data only — name, brand, image — so this route does not require a
 * subscription. It still resolves the user, because every search is recorded
 * in the history and because the response advertises whether nutrition would
 * be unlocked on the detail page.
 */
productsRouter.get(
  '/products/search',
  attachDemoUser,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { q, lang, page, pageSize } = searchQuerySchema.parse(req.query);

    const result = await searchProducts({ term: q, language: lang, page, pageSize });

    const products = result.products
      .map((raw) => toProductSummary(raw, lang))
      // Drop entries with no barcode: they cannot be opened, so showing them
      // would produce dead tiles.
      .filter((product): product is ProductSummary => product !== null)
      // Push threadbare records down rather than hiding them. The assignment
      // asks us to handle incomplete data, not to pretend it does not exist.
      .sort((a, b) => b.completeness - a.completeness);

    // History is best-effort and must not delay or fail the response.
    await recordSearch({
      userId: user.id,
      term: q,
      language: lang,
      resultCount: result.totalCount,
    });

    const hasSubscription = await userHasActiveSubscription(user.id);

    res.json({
      query: q,
      language: lang,
      page: result.page,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
      // The search index caps its count at 10 000; tell the UI when the number
      // it is about to render is a floor rather than a total.
      isCountExact: result.isCountExact,
      hasMore: result.page * result.pageSize < result.totalCount,
      hasSubscription,
      products,
    });
  }),
);

/**
 * GET /api/products/:barcode
 *
 * The gate. `toProductDetail` receives the entitlement flag and simply does not
 * build the nutrition object when it is false, so unpaid responses never carry
 * the values over the wire.
 */
productsRouter.get(
  '/products/:barcode',
  attachDemoUser,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const parsedBarcode = barcodeSchema.safeParse(req.params.barcode);
    if (!parsedBarcode.success) {
      throw HttpError.badRequest('That is not a valid barcode.');
    }

    const lang = toLanguage(req.query.lang);
    const raw = await fetchProduct(parsedBarcode.data, lang);

    if (raw === null) {
      throw HttpError.notFound('No product with that barcode exists in Open Food Facts.');
    }

    const hasSubscription = await userHasActiveSubscription(user.id);
    const product = toProductDetail(raw, lang, hasSubscription);

    if (product === null) {
      throw HttpError.notFound('That product record is too incomplete to display.');
    }

    res.json({ language: lang, hasSubscription, product });
  }),
);
