import { SubscriptionStatus, type Subscription } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Entitlement: the one question the product routes ask before deciding whether
 * nutritional values go into a response.
 *
 * Deliberately reads the local `subscriptions` table rather than calling
 * Stripe. Stripe is the source of truth, the webhook keeps our mirror current,
 * and the request path stays fast and independent of Stripe's availability.
 * The trade-off — a few seconds of staleness between payment and access — is
 * documented in the README.
 */

/** Statuses Stripe considers "the customer is paid up and should have access". */
const ENTITLING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
]);

export interface SubscriptionView {
  isActive: boolean;
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * `now` is injectable so the expiry branch is testable without freezing the
 * system clock.
 */
export function isSubscriptionActive(
  subscription: Pick<Subscription, 'status' | 'currentPeriodEnd'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (!ENTITLING_STATUSES.has(subscription.status)) return false;

  // Belt and braces. Stripe sends `customer.subscription.deleted` at the end of
  // a cancelled period, but if that webhook is ever missed we must not keep
  // serving paid data forever.
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() <= now.getTime()) {
    return false;
  }

  return true;
}

export function toSubscriptionView(
  subscription: Subscription | null | undefined,
  now: Date = new Date(),
): SubscriptionView {
  return {
    isActive: isSubscriptionActive(subscription, now),
    status: subscription?.status ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
  };
}

export async function getSubscriptionForUser(userId: string): Promise<Subscription | null> {
  return prisma.subscription.findUnique({ where: { userId } });
}

export async function userHasActiveSubscription(userId: string): Promise<boolean> {
  return isSubscriptionActive(await getSubscriptionForUser(userId));
}
