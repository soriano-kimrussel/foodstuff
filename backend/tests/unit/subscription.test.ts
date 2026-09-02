import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '@prisma/client';
import {
  isSubscriptionActive,
  toSubscriptionView,
} from '../../src/services/subscription.service.js';
import {
  extractCurrentPeriodEnd,
  mapStripeStatus,
} from '../../src/services/webhook.service.js';

const NOW = new Date('2026-06-15T12:00:00Z');
const FUTURE = new Date('2026-07-15T12:00:00Z');
const PAST = new Date('2026-05-15T12:00:00Z');

/**
 * Entitlement is the whole point of the paywall, so its edge cases get tested
 * directly rather than only through the HTTP layer.
 */
describe('isSubscriptionActive', () => {
  it('grants access while active and inside the period', () => {
    expect(
      isSubscriptionActive(
        { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: FUTURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('grants access during a trial', () => {
    expect(
      isSubscriptionActive(
        { status: SubscriptionStatus.TRIALING, currentPeriodEnd: FUTURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('refuses when there is no subscription at all', () => {
    expect(isSubscriptionActive(null, NOW)).toBe(false);
    expect(isSubscriptionActive(undefined, NOW)).toBe(false);
  });

  it.each([
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.INCOMPLETE,
    SubscriptionStatus.INCOMPLETE_EXPIRED,
    SubscriptionStatus.UNPAID,
    SubscriptionStatus.PAUSED,
  ])('refuses status %s even with time left on the clock', (status) => {
    expect(isSubscriptionActive({ status, currentPeriodEnd: FUTURE }, NOW)).toBe(false);
  });

  it('refuses an ACTIVE row whose period has already elapsed', () => {
    // The safety net for a missed customer.subscription.deleted webhook.
    expect(
      isSubscriptionActive({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: PAST }, NOW),
    ).toBe(false);
  });

  it('allows an active subscription with no known period end', () => {
    expect(
      isSubscriptionActive({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null }, NOW),
    ).toBe(true);
  });
});

describe('toSubscriptionView', () => {
  it('reports a safe default when nothing is stored', () => {
    expect(toSubscriptionView(null, NOW)).toEqual({
      isActive: false,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });
});

describe('mapStripeStatus', () => {
  it('maps every Stripe status onto our enum', () => {
    expect(mapStripeStatus('active')).toBe(SubscriptionStatus.ACTIVE);
    expect(mapStripeStatus('past_due')).toBe(SubscriptionStatus.PAST_DUE);
    expect(mapStripeStatus('incomplete_expired')).toBe(SubscriptionStatus.INCOMPLETE_EXPIRED);
  });

  it('fails closed on a status Stripe adds later', () => {
    // INCOMPLETE does not entitle, so an unknown status locks rather than opens.
    expect(mapStripeStatus('something_new')).toBe(SubscriptionStatus.INCOMPLETE);
  });
});

describe('extractCurrentPeriodEnd', () => {
  const epochSeconds = 1_781_000_000;

  it('reads the legacy top-level field', () => {
    const subscription = { current_period_end: epochSeconds, items: { data: [] } };
    expect(extractCurrentPeriodEnd(subscription as never)).toEqual(
      new Date(epochSeconds * 1000),
    );
  });

  it('reads the newer per-item field', () => {
    // Stripe's 2025 API versions moved the field onto subscription items.
    const subscription = { items: { data: [{ current_period_end: epochSeconds }] } };
    expect(extractCurrentPeriodEnd(subscription as never)).toEqual(
      new Date(epochSeconds * 1000),
    );
  });

  it('returns null when neither shape carries a period', () => {
    expect(extractCurrentPeriodEnd({ items: { data: [] } } as never)).toBeNull();
  });
});
