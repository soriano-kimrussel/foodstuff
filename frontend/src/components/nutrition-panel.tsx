import { createTranslator } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { Messages } from '@/i18n';
import type { ProductDetail } from '@/lib/types';
import { SubscribeButton } from './subscribe-button';

/**
 * The paywalled panel.
 *
 * Three distinct states, which are easy to conflate and shouldn't be:
 *
 *   locked      — the user has no subscription. The backend sent no values at
 *                 all, so there is nothing here to reveal with devtools.
 *   unavailable — the user has access, but Open Food Facts has no nutrition
 *                 data for this product. Not a paywall problem.
 *   available   — show the table.
 */
export function NutritionPanel({
  product,
  locale,
}: {
  product: ProductDetail;
  locale: Locale;
}) {
  const { m } = createTranslator(locale);

  return (
    <section
      aria-labelledby="nutrition-heading"
      className="rounded-lg border border-line bg-raised p-4 sm:p-5"
    >
      <h2 id="nutrition-heading" className="text-sm font-semibold">
        {m.nutrition.heading}
      </h2>

      {product.nutritionLocked ? (
        <LockedNotice locale={locale} m={m} />
      ) : !product.nutritionAvailable || product.nutrition === null ? (
        <p className="mt-3 text-sm text-muted">{m.nutrition.unavailable}</p>
      ) : (
        <NutritionTable nutrition={product.nutrition} locale={locale} m={m} />
      )}
    </section>
  );
}

function LockedNotice({ locale, m }: { locale: Locale; m: Messages }) {
  return (
    <div className="mt-3">
      <div className="rounded-md border border-dashed border-line bg-surface p-4">
        <p className="text-sm font-medium">{m.nutrition.locked}</p>
        <p className="mt-1 text-sm text-muted">{m.nutrition.lockedBody}</p>

        <SubscribeButton
          locale={locale}
          label={m.billing.subscribe}
          pendingLabel={m.billing.subscribing}
          errorLabel={m.billing.error}
          className="mt-4"
        />

        <p className="mt-3 text-xs text-muted">{m.billing.testCardHint}</p>
      </div>
    </div>
  );
}

function NutritionTable({
  nutrition,
  locale,
  m,
}: {
  nutrition: NonNullable<ProductDetail['nutrition']>;
  locale: Locale;
  m: Messages;
}) {
  const { formatNumber } = createTranslator(locale);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {nutrition.nutriScore ? (
          <ScoreChip label={m.nutrition.nutriScore} value={nutrition.nutriScore.toUpperCase()} />
        ) : null}
        {nutrition.novaGroup ? (
          <ScoreChip
            label={m.nutrition.novaGroup}
            value={String(nutrition.novaGroup)}
            detail={
              m.nutrition.novaLabels[String(nutrition.novaGroup) as '1' | '2' | '3' | '4']
            }
          />
        ) : null}
        {nutrition.ecoScore ? (
          <ScoreChip label={m.nutrition.ecoScore} value={nutrition.ecoScore.toUpperCase()} />
        ) : null}
      </div>

      {nutrition.per100g.length > 0 ? (
        <>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">
            {m.nutrition.per100g}
          </p>
          {/* Wide tables scroll inside their own box rather than the page. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {nutrition.per100g.map((nutrient) => (
                  <tr key={nutrient.key} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                      {m.nutrition.nutrients[
                        nutrient.key as keyof Messages['nutrition']['nutrients']
                      ] ?? nutrient.key}
                    </th>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {formatNumber(nutrient.value, { maximumFractionDigits: 1 })} {nutrient.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {nutrition.servingSize ? (
        <p className="mt-3 text-xs text-muted">
          {m.nutrition.servingSize}: {nutrition.servingSize}
        </p>
      ) : null}
    </div>
  );
}

function ScoreChip({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <span
      title={detail}
      className="inline-flex items-baseline gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </span>
  );
}
