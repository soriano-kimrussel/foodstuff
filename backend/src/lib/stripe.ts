import Stripe from 'stripe';
import { env } from '../config/env.js';

/**
 * Stripe client, pinned to an explicit API version.
 *
 * Pinning matters: Stripe reshapes objects between versions (for example
 * `current_period_end` moved from the subscription onto its items), and an
 * unpinned client silently follows the account default. The webhook handler
 * reads both shapes defensively, but the pin is what makes that predictable.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
  appInfo: {
    name: 'FoodFacts Explorer (technical test)',
    version: '1.0.0',
  },
});
