import { Router } from 'express';
import type Stripe from 'stripe';
import { env } from '../config/env.js';
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { claimEvent, handleStripeEvent } from '../services/webhook.service.js';

export const webhooksRouter = Router();

/**
 * POST /api/webhooks/stripe
 *
 * Note what this route does NOT have: `attachDemoUser`. It is called by Stripe,
 * not by a browser, and its authentication is the signature header — which is
 * why app.ts mounts express.raw() for this path only. Signature verification
 * needs the exact bytes Stripe signed; a parsed-and-reserialized body will not
 * match.
 */
webhooksRouter.post(
  '/webhooks/stripe',
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (typeof signature !== 'string') {
      res.status(400).json({
        error: { code: 'missing_signature', message: 'Missing stripe-signature header.' },
      });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      // Deliberately terse: a caller who cannot sign gets no detail about why.
      logger.warn('rejected stripe webhook with a bad signature', { error: String(error) });
      res.status(400).json({
        error: { code: 'invalid_signature', message: 'Signature verification failed.' },
      });
      return;
    }

    // Claim before handling. A replay of an already-processed event is a
    // success, not an error — returning non-2xx would make Stripe retry it.
    const isNew = await claimEvent(event.id, event.type);
    if (!isNew) {
      res.json({ received: true, duplicate: true });
      return;
    }

    try {
      await handleStripeEvent(event);
    } catch (error) {
      // Give the claim back so Stripe's retry can actually do something. If we
      // kept it, the retry would be swallowed as a duplicate and the
      // subscription would stay out of sync forever.
      await releaseClaim(event.id);
      throw error;
    }

    res.json({ received: true });
  }),
);

async function releaseClaim(eventId: string): Promise<void> {
  const { prisma } = await import('../lib/prisma.js');
  try {
    await prisma.processedWebhookEvent.delete({ where: { id: eventId } });
  } catch (error) {
    logger.error('could not release webhook claim', { eventId, error: String(error) });
  }
}
