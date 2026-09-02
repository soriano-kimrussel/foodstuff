import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createTranslator, languageName } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { ApiError, getProduct } from '@/lib/api';
import { NutritionPanel } from '@/components/nutrition-panel';

interface PageProps {
  params: Promise<{ locale: string; barcode: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, barcode } = await params;
  if (!isLocale(locale)) return {};

  try {
    const { product } = await getProduct(barcode, locale);
    return {
      title: product.name?.value ?? barcode,
      description: product.genericName?.value ?? undefined,
    };
  } catch {
    // A missing product should still render a page; metadata is not the place
    // to surface that.
    return {};
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { locale: rawLocale, barcode } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const { m, t } = createTranslator(locale);

  let data;
  try {
    data = await getProduct(barcode, locale);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    // Everything the API can plausibly return gets a readable page. Rethrowing
    // anything but a genuine bug would hand the user Next's blank "Application
    // error" screen, which is what an Open Food Facts timeout used to do.
    // Map the API's error CODE to a translated string. Rendering
    // `error.message` directly would put the backend's English text inside a
    // French page — the one place where an otherwise fully translated UI leaks.
    const heading = error.isNotFound ? m.product.notFound : m.errors.generic;
    const detail = error.isNotFound
      ? m.product.notFoundHint
      : error.isUnreachable
        ? m.errors.backendUnreachable
        : error.code === 'service_unavailable'
          ? m.errors.upstreamSlow
          : error.code === 'upstream_error'
            ? m.errors.upstreamUnavailable
            : m.errors.generic;

    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
        <BackLink locale={locale} label={m.product.backToSearch} className="mt-6 inline-block" />
      </div>
    );
  }

  const { product } = data;
  const name = product.name?.value ?? m.product.noName;

  return (
    <article className="flex flex-col gap-6">
      <BackLink locale={locale} label={m.product.backToSearch} />

      <header className="grid gap-6 sm:grid-cols-[220px_1fr]">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line bg-raised">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={name}
              className="h-full w-full object-contain p-3"
            />
          ) : (
            <span className="px-4 text-center text-xs text-muted">{m.product.noImage}</span>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
            {name}
          </h1>

          <p className="mt-1 text-sm text-muted">
            {product.brands.length > 0 ? product.brands.join(', ') : m.product.noBrand}
          </p>

          {/* Honesty about which language the data actually came back in. */}
          {product.name?.isFallback && product.name.language ? (
            <p className="mt-2 text-xs text-muted">
              {t(m.product.translatedFrom, {
                language: languageName(product.name.language, locale),
                requested: languageName(locale, locale),
              })}
            </p>
          ) : null}

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {product.quantity ? (
              <Field label={m.product.quantity} value={product.quantity} />
            ) : null}
            <Field label={m.product.barcode} value={product.code} mono />
            {product.countries.length > 0 ? (
              <Field label={m.product.countries} value={product.countries.join(', ')} />
            ) : null}
          </dl>

          {product.categories.length > 0 ? (
            <TagList label={m.product.categories} tags={product.categories} />
          ) : null}
          {product.labels.length > 0 ? (
            <TagList label={m.product.labels} tags={product.labels} />
          ) : null}

          {product.completeness < 0.5 ? (
            <p className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {m.product.incomplete}
            </p>
          ) : null}
        </div>
      </header>

      <NutritionPanel product={product} locale={locale} />

      <section className="rounded-lg border border-line bg-raised p-4 sm:p-5">
        <h2 className="text-sm font-semibold">{m.product.ingredients}</h2>
        {product.ingredients ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink">{product.ingredients.value}</p>
            {product.ingredients.isFallback && product.ingredients.language ? (
              <p className="mt-2 text-xs text-muted">
                {t(m.product.translatedFrom, {
                  language: languageName(product.ingredients.language, locale),
                  requested: languageName(locale, locale),
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{m.product.noIngredients}</p>
        )}
      </section>
    </article>
  );
}

function BackLink({
  locale,
  label,
  className,
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={`/${locale}`}
      className={`text-sm text-muted underline-offset-4 hover:text-ink hover:underline ${className ?? ''}`}
    >
      ← {label}
    </Link>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</dd>
    </div>
  );
}

function TagList({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li
            key={tag}
            className="rounded bg-surface px-2 py-0.5 text-xs text-muted ring-1 ring-inset ring-line"
          >
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
}
