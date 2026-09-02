import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { SubscriptionStatus, type User } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { stripe } from '../../src/lib/stripe.js';
import { disconnect, resetDatabase, seedDemoUser } from '../helpers/db.js';

/**
 * Stripe webhook handling.
 *
 * Signatures are real: `stripe.webhooks.generateTestHeaderString` signs the
 * payload with the same secret the app verifies against, so this exercises the
 * genuine verification path rather than stubbing past it. Nothing here touches
 * the Stripe network.
 */

const app = createApp();
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret';
const ENDPOINT = '/api/webhooks/stripe';

let user: User;

beforeEach(async () => {
  await resetDatabase();
  user = await seedDemoUser({ stripeCustomerId: 'cus_test_123' });
  vi.restoreAllMocks();
});

afterAll(async () => {
  await disconnect();
});

/** Build a signed request body exactly as Stripe would send it. */
function signedEvent(event: Record<string, unknown>): { payload: string; signature: string } {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return { payload, signature };
}

function subscriptionEvent(
  overrides: {
    id?: string;
    eventId?: string;
    type?: string;
    status?: string;
    userId?: string;
    customer?: string;
    cancelAtPeriodEnd?: boolean;
    periodEnd?: number;
  } = {},
) {
  const periodEnd = overrides.periodEnd ?? Math.floor(Date.now() / 1000) + 30 * 86_400;

  return {
    id: overrides.eventId ?? `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type: overrides.type ?? 'customer.subscription.updated',
    data: {
      object: {
        id: overrides.id ?? 'sub_test_abc',
        object: 'subscription',
        status: overrides.status ?? 'active',
        customer: overrides.customer ?? 'cus_test_123',
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
        current_period_end: periodEnd,
        metadata: overrides.userId ? { userId: overrides.userId } : {},
        items: {
          object: 'list',
          data: [
            {
              id: 'si_test',
              price: { id: 'price_test_monthly' },
              current_period_end: periodEnd,
            },
          ],
        },
      },
    },
  };
}

describe('POST /api/webhooks/stripe — authentication', () => {
  it('rejects a request with no signature header', async () => {
    const response = await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(subscriptionEvent()));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('missing_signature');
  });

  it('rejects a forged signature', async () => {
    const payload = JSON.stringify(subscriptionEvent());

    const response = await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=1,v1=deadbeef')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_signature');

    // Nothing may be written on a rejected request.
    expect(await prisma.subscription.count()).toBe(0);
    expect(await prisma.processedWebhookEvent.count()).toBe(0);
  });

  it('rejects a body that was tampered with after signing', async () => {
    const { signature } = signedEvent(subscriptionEvent());
    const tampered = JSON.stringify(subscriptionEvent({ status: 'active', id: 'sub_evil' }));

    const response = await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(tampered);

    expect(response.status).toBe(400);
  });
});

describe('POST /api/webhooks/stripe — subscription sync', () => {
  it('creates a subscription and unlocks access', async () => {
    const { payload, signature } = signedEvent(
      subscriptionEvent({ type: 'customer.subscription.created', userId: user.id }),
    );

    const response = await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription).toMatchObject({
      stripeSubscriptionId: 'sub_test_abc',
      stripePriceId: 'price_test_monthly',
      status: SubscriptionStatus.ACTIVE,
    });
    expect(subscription?.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('matches the user by customer id when metadata is absent', async () => {
    // A subscription created straight from the Stripe dashboard has no
    // userId metadata; the customer id is the only link back to us.
    const { payload, signature } = signedEvent(subscriptionEvent({ customer: 'cus_test_123' }));

    await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload);

    expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).not.toBeNull();
  });

  it('revokes access on cancellation', async () => {
    const created = signedEvent(
      subscriptionEvent({ type: 'customer.subscription.created', userId: user.id }),
    );
    await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', created.signature)
      .send(created.payload);

    const deleted = signedEvent(
      subscriptionEvent({
        type: 'customer.subscription.deleted',
        status: 'canceled',
        userId: user.id,
      }),
    );
    await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', deleted.signature)
      .send(deleted.payload);

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription?.status).toBe(SubscriptionStatus.CANCELED);
  });

  it('ignores an event for a customer we do not know, without failing', async () => {
    // Returning non-2xx here would put Stripe into a retry loop over a
    // subscription that will never be ours.
    const { payload, signature } = signedEvent(subscriptionEvent({ customer: 'cus_someone_else' }));

    const response = await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(await prisma.subscription.count()).toBe(0);
  });

  it('acknowledges an event type it does not handle', async () => {
    const { payload, signature } = signedEvent(
      subscriptionEvent({ type: 'invoice.payment_succeeded' }),
    );

    const response = await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/webhooks/stripe — idempotency', () => {
  it('processes a redelivered event only once', async () => {
    const { payload, signature } = signedEvent(
      subscriptionEvent({ eventId: 'evt_duplicate_1', userId: user.id }),
    );

    const send = () =>
      request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

    const first = await send();
    const second = await send();

    expect(first.body).toEqual({ received: true });
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(await prisma.processedWebhookEvent.count()).toBe(1);
  });

  it('releases the claim when handling fails, so Stripe can retry', async () => {
    // If a failed event kept its claim, Stripe's retry would be swallowed as a
    // duplicate and the subscription would never sync.
    //
    // The failure is injected at the Stripe call rather than at Prisma: spying
    // on a Prisma delegate method and restoring it deletes the property (the
    // client defines them lazily), which breaks every later test in the file.
    const retrieve = vi
      .spyOn(stripe.subscriptions, 'retrieve')
      .mockRejectedValueOnce(new Error('stripe is down'));

    const { payload, signature } = signedEvent({
      id: 'evt_transient_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_transient', subscription: 'sub_transient' } },
    });

    const send = () =>
      request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

    const failed = await send();

    expect(failed.status).toBe(500);
    // The claim was given back, so the event is not remembered as processed.
    expect(await prisma.processedWebhookEvent.count()).toBe(0);

    // Stripe recovers; the retry must now be allowed through and take effect.
    retrieve.mockResolvedValue({
      id: 'sub_transient',
      status: 'active',
      customer: 'cus_test_123',
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86_400,
      metadata: { userId: user.id },
      items: { data: [{ id: 'si_1', price: { id: 'price_test_monthly' } }] },
    } as never);

    const retried = await send();

    expect(retried.status).toBe(200);
    expect(await prisma.processedWebhookEvent.count()).toBe(1);

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription?.stripeSubscriptionId).toBe('sub_transient');
  });

  it('handles checkout.session.completed by fetching the real subscription', async () => {
    // The session payload carries only a subscription id, so the handler has
    // to retrieve the object to learn its status and period.
    const retrieve = vi.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue({
      id: 'sub_from_checkout',
      status: 'active',
      customer: 'cus_test_123',
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86_400,
      metadata: { userId: user.id },
      items: { data: [{ id: 'si_1', price: { id: 'price_test_monthly' } }] },
    } as never);

    const { payload, signature } = signedEvent({
      id: 'evt_checkout_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', subscription: 'sub_from_checkout' } },
    });

    const response = await request(app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_from_checkout');

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription?.stripeSubscriptionId).toBe('sub_from_checkout');
    expect(subscription?.status).toBe(SubscriptionStatus.ACTIVE);
  });
});
