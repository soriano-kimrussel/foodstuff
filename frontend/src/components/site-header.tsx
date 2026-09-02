import Link from 'next/link';
import { createTranslator } from '@/i18n';
import type { Locale } from '@/i18n/config';
import type { SubscriptionView } from '@/lib/types';
import { LanguageSelector } from './language-selector';

/**
 * Server Component: the subscription badge is rendered from data the server
 * already has, so there is no flash of "free plan" before the real state loads.
 */
export function SiteHeader({
  locale,
  subscription,
}: {
  locale: Locale;
  subscription: SubscriptionView | null;
}) {
  const { m, t, formatDate } = createTranslator(locale);
  const isActive = subscription?.isActive === true;

  return (
    <header className="border-b border-line bg-raised">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href={`/${locale}`} className="text-sm font-semibold tracking-tight">
          {m.meta.title}
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <SubscriptionBadge
            isActive={isActive}
            activeLabel={m.nav.subscribed}
            inactiveLabel={m.nav.notSubscribed}
            detail={
              isActive && subscription?.currentPeriodEnd
                ? t(subscription.cancelAtPeriodEnd ? m.billing.endsOn : m.billing.renewsOn, {
                    date: formatDate(subscription.currentPeriodEnd),
                  })
                : undefined
            }
          />
          <LanguageSelector locale={locale} />
        </div>
      </div>
    </header>
  );
}

function SubscriptionBadge({
  isActive,
  activeLabel,
  inactiveLabel,
  detail,
}: {
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
  detail?: string;
}) {
  return (
    <span
      title={detail}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        isActive
          ? 'bg-brand/10 text-brand'
          : 'bg-line text-muted',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-brand' : 'bg-muted'}`}
      />
      {isActive ? activeLabel : inactiveLabel}
    </span>
  );
}
