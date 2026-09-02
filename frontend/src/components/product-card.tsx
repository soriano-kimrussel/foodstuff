import Link from 'next/link';
import { createTranslator, languageName } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { ProductSummary } from '@/lib/types';

/**
 * One search result.
 *
 * Every field here is optional in the source data, so each has an explicit
 * empty state rather than rendering a blank. That is the "handle missing or
 * incomplete data" requirement made concrete at the component level.
 */
export function ProductCard({ product, locale }: { product: ProductSummary; locale: Locale }) {
  const { m } = createTranslator(locale);

  const name = product.name?.value ?? m.product.noName;
  const brand = product.brands[0] ?? m.product.noBrand;
  const isTranslated = product.name?.isFallback === true;

  return (
    <Link
      href={`/${locale}/product/${product.code}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-line bg-raised transition-shadow hover:shadow-md focus-visible:shadow-md"
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface">
        {product.thumbnailUrl ? (
          // Plain <img>, not next/image: Open Food Facts photos come from a
          // handful of hosts at unpredictable sizes and the optimizer would add
          // a round-trip per tile for no visual gain at this scale.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain p-2 transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <span className="px-3 text-center text-xs text-muted">{m.product.noImage}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{name}</h3>
        <p className="line-clamp-1 text-xs text-muted">{brand}</p>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
          {product.quantity ? (
            <span className="text-xs text-muted">{product.quantity}</span>
          ) : null}
          {isTranslated && product.name?.language ? (
            <span className="rounded bg-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              {languageName(product.name.language, locale)}
            </span>
          ) : null}
          {product.completeness < 0.5 ? (
            <span
              title={m.product.incomplete}
              className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
            >
              {Math.round(product.completeness * 100)}%
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
