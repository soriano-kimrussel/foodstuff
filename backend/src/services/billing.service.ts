import type { User } from '@prisma/client';
import type Stripe from 'stripe';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import type { Language } from './openfoodfacts/locales.js';

/**
 * Everything that talks *to* Stripe. The reverse direction — Stripe talking to
 * us — lives in webhook.service.ts.
 */

/**
 * Stripe being unavailable is an upstream failure, not a bug in this service,
 * so it must surface as 502 rather than a bare 500. Without this wrapper the
 * SDK's own error escapes to the generic handler and the client is told
 * "something went wrong on our side", which sends whoever is debugging it to
 * the wrong logs.
 */
async function callStripe<T>(operation: () => Promise<T>, label: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error(`stripe call failed: ${label}`, { error: String(error) });
    throw HttpError.badGateway(`Stripe could not ${label}. Please try again.`);
  }
}

/**
 * Get or create the Stripe Customer for a user.
 *
 * Created lazily so a freshly seeded database needs no Stripe round-trip, and
 * so the test suite can run without Stripe credentials until it actually
 * exercises checkout.
 */
export async function ensureStripeCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await callStripe(
    () =>
      stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        // Lets the webhook find our user even for events that carry a customer
        // but no subscription metadata.
        metadata: { userId: user.id },
      }),
    'create customer',
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  logger.info('created stripe customer', { userId: user.id, customerId: customer.id });
  return customer.id;
}

/** Stripe Checkout supports these; anything else falls back to English. */
const STRIPE_LOCALES: Record<Language, Stripe.Checkout.SessionCreateParams.Locale> = {
  en: 'en',
  nl: 'nl',
  de: 'de',
  fr: 'fr',
};

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

/**
 * Create a monthly subscription Checkout session.
 *
 * The success and cancel URLs point back into the localized frontend so the
 * user returns to the language they left in.
 */
export async function createCheckoutSession(
  user: User,
  language: Language,
): Promise<CheckoutSessionResult> {
  const customerId = await ensureStripeCustomer(user);

  const session = await callStripe(
    () =>
      stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
        locale: STRIPE_LOCALES[language],
        success_url: `${env.FRONTEND_URL}/${language}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.FRONTEND_URL}/${language}/billing/cancel`,
        // Copied onto the resulting Subscription, so the webhook can attribute
        // an event even if the customer lookup ever fails.
        subscription_data: { metadata: { userId: user.id } },
        metadata: { userId: user.id },
        allow_promotion_codes: true,
      }),
    'create checkout session',
  );

  if (!session.url) {
    throw HttpError.badGateway('Stripe did not return a checkout URL.');
  }

  logger.info('created checkout session', { userId: user.id, sessionId: session.id });
  return { sessionId: session.id, url: session.url };
}

/**
 * Billing portal, so the demo can cancel again without the Stripe dashboard.
 * Requires the portal to be configured once in test mode; if it is not, Stripe
 * returns an error we translate into something actionable.
 */
export async function createPortalSession(user: User, language: Language): Promise<string> {
  if (!user.stripeCustomerId) {
    throw HttpError.badRequest('This user has no Stripe customer yet. Subscribe first.');
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${env.FRONTEND_URL}/${language}`,
    });
    return session.url;
  } catch (error) {
    logger.error('failed to create billing portal session', { error: String(error) });
    throw HttpError.badGateway(
      'Could not open the Stripe billing portal. Enable it once at ' +
        'https://dashboard.stripe.com/test/settings/billing/portal.',
    );
  }
}
