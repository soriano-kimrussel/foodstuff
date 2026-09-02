import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { SubscriptionStatus, type User } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { stripe } from '../../src/lib/stripe.js';
import { disconnect, resetDatabase, seedDemoUser } from '../helpers/db.js';

/**
 * Checkout session creation.
 *
 * The Stripe SDK is stubbed at the method boundary — no network — but
 * everything on our side of it is real: the customer is persisted, the price
 * and locale come from config, and the return URLs are built from the actual
 * FRONTEND_URL.
 */

const app = createApp();
let user: User;

beforeEach(async () => {
  await resetDatabase();
  user = await seedDemoUser();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await disconnect();
});

function stubStripe() {
  const customers = vi
    .spyOn(stripe.customers, 'create')
    .mockResolvedValue({ id: 'cus_new_123' } as never);

  const sessions = vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({
    id: 'cs_test_new',
    url: 'https://checkout.stripe.com/c/pay/cs_test_new',
  } as never);

  return { customers, sessions };
}

describe('POST /api/billing/checkout-session', () => {
  it('creates a Stripe customer on first use and persists the id', async () => {
    const { customers } = stubStripe();

    const response = await request(app)
      .post('/api/billing/checkout-session')
      .send({ language: 'en' });

    expect(response.status).toBe(201);
    expect(response.body.url).toContain('checkout.stripe.com');

    expect(customers).toHaveBeenCalledWith(
      expect.objectContaining({ email: user.email, metadata: { userId: user.id } }),
    );

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.stripeCustomerId).toBe('cus_new_123');
  });

  it('reuses an existing Stripe customer', async () => {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: 'cus_existing' },
    });
    const { customers, sessions } = stubStripe();

    await request(app).post('/api/billing/checkout-session').send({ language: 'en' });

    expect(customers).not.toHaveBeenCalled();
    expect(sessions).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' }),
    );
  });

  it('creates a monthly subscription session with the configured price', async () => {
    const { sessions } = stubStripe();

    await request(app).post('/api/billing/checkout-session').send({ language: 'en' });

    expect(sessions).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      }),
    );
  });

  it('passes the language to Stripe and returns the user to that locale', async () => {
    const { sessions } = stubStripe();

    await request(app).post('/api/billing/checkout-session').send({ language: 'de' });

    const params = sessions.mock.calls[0]?.[0] as {
      locale: string;
      success_url: string;
      cancel_url: string;
    };

    expect(params.locale).toBe('de');
    expect(params.success_url).toContain('/de/billing/success');
    expect(params.cancel_url).toContain('/de/billing/cancel');
  });

  it('falls back to English for an unsupported language rather than erroring', async () => {
    const { sessions } = stubStripe();

    await request(app).post('/api/billing/checkout-session').send({ language: 'es' });

    expect((sessions.mock.calls[0]?.[0] as { locale: string }).locale).toBe('en');
  });

  it('refuses to start a second checkout while a subscription is active', async () => {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId: 'sub_active',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
    const { sessions } = stubStripe();

    const response = await request(app)
      .post('/api/billing/checkout-session')
      .send({ language: 'en' });

    // Otherwise the demo user could be billed twice by clicking twice.
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('already_subscribed');
    expect(sessions).not.toHaveBeenCalled();
  });

  it('allows checkout again after cancellation', async () => {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId: 'sub_gone',
        status: SubscriptionStatus.CANCELED,
      },
    });
    stubStripe();

    const response = await request(app)
      .post('/api/billing/checkout-session')
      .send({ language: 'en' });

    expect(response.status).toBe(201);
  });

  it('surfaces a Stripe outage as 502 rather than 500', async () => {
    vi.spyOn(stripe.customers, 'create').mockRejectedValue(new Error('stripe down'));

    const response = await request(app)
      .post('/api/billing/checkout-session')
      .send({ language: 'en' });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('upstream_error');
  });
});
