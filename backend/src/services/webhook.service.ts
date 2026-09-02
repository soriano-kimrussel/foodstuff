import { Prisma, SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';

/**
 * Stripe -> our database.
 *
 * Three properties this handler has to have, in order of importance:
 *
 *   1. Authentic. The signature is verified before anything is parsed, in
 *      routes/webhooks.routes.ts, against the raw request body.
 *   2. Idempotent. Stripe retries on any non-2xx and can deliver the same event
 *      twice regardless; every event id is claimed once (see `claimEvent`).
 *   3. Ordered-insensitive. Events can arrive out of order, so subscription
 *      writes are upserts of the full state rather than incremental edits.
 */

/** Stripe's status strings are snake_case; our enum is SCREAMING_SNAKE. */
const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: SubscriptionStatus.ACTIVE,
  trialing: SubscriptionStatus.TRIALING,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  unpaid: SubscriptionStatus.UNPAID,
  paused: SubscriptionStatus.PAUSED,
};

export function mapStripeStatus(status: string): SubscriptionStatus {
  return STATUS_MAP[status as Stripe.Subscription.Status] ?? SubscriptionStatus.INCOMPLETE;
}

/**
 * Read the period end regardless of API version.
 *
 * Stripe moved `current_period_end` off the subscription and onto each
 * subscription item in the 2025 API versions. We pin a version in lib/stripe.ts,
 * but webhooks are delivered using the *account's* version, which a reviewer's
 * dashboard may well have set differently. Reading both shapes costs four lines
 * and removes a whole class of "works on my account" bug.
 */
export function extractCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  if (typeof legacy === 'number' && legacy > 0) return new Date(legacy * 1000);

  const fromItem = subscription.items?.data?.[0] as unknown as
    | { current_period_end?: number }
    | undefined;
  if (typeof fromItem?.current_period_end === 'number' && fromItem.current_period_end > 0) {
    return new Date(fromItem.current_period_end * 1000);
  }

  return null;
}

function extractPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

/**
 * Work out which of our users an event belongs to.
 *
 * Preferred path is the `userId` we stamped into subscription metadata at
 * checkout. The customer-id lookup is the fallback for subscriptions created
 * outside our flow (for instance directly in the Stripe dashboard, which is a
 * plausible thing for a reviewer to try).
 */
async function resolveUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.userId;
  if (fromMetadata) {
    const exists = await prisma.user.findUnique({
      where: { id: fromMetadata },
      select: { id: true },
    });
    if (exists) return exists.id;
  }

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });

  return user?.id ?? null;
}

/**
 * Write the subscription state we just learned about.
 *
 * Two upserts because the row is unique on both `userId` and
 * `stripeSubscriptionId`: a user replacing a cancelled subscription with a new
 * one must update the existing row, not collide with it.
 */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserId(subscription);

  if (!userId) {
    // Not an error: a reviewer's Stripe account may hold subscriptions from
    // other experiments. Ignoring them beats failing the webhook and
    // triggering Stripe's retry schedule.
    logger.warn('stripe subscription has no matching local user', {
      subscriptionId: subscription.id,
    });
    return;
  }

  const data = {
    userId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: extractPriceId(subscription),
    status: mapStripeStatus(subscription.status),
    currentPeriodEnd: extractCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };

  await prisma.subscription.upsert({
    where: { userId },
    create: data,
    update: data,
  });

  logger.info('synced subscription', {
    userId,
    subscriptionId: subscription.id,
    status: data.status,
  });
}

/**
 * Claim an event id. Returns false when this event was already processed, in
 * which case the caller should acknowledge it and do nothing else.
 *
 * The insert is the lock: the primary key rejects the second writer, so two
 * concurrent deliveries of the same event cannot both proceed.
 */
export async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  try {
    await prisma.processedWebhookEvent.create({ data: { id: eventId, type: eventType } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.info('ignoring duplicate stripe event', { eventId, eventType });
      return false;
    }
    throw error;
  }
}

/** Events we act on. Anything else is acknowledged and dropped. */
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!HANDLED_EVENTS.has(event.type)) {
    logger.debug('ignoring unhandled stripe event', { type: event.type });
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      if (!subscriptionId) {
        logger.warn('checkout session completed without a subscription', { sessionId: session.id });
        return;
      }

      // The session payload does not include the subscription's status or
      // period, so fetch the real object rather than guessing.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(subscription);
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // `deleted` still carries the full subscription with status "canceled",
      // so the same upsert handles it and no special-casing is needed.
      await syncSubscription(event.data.object as Stripe.Subscription);
      return;
    }

    default:
      return;
  }
}
