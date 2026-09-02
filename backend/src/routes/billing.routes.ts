import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { attachDemoUser, requireUser } from '../middleware/demo-user.js';
import { createCheckoutSession, createPortalSession } from '../services/billing.service.js';
import { SUPPORTED_LANGUAGES } from '../services/openfoodfacts/locales.js';
import {
  getSubscriptionForUser,
  toSubscriptionView,
} from '../services/subscription.service.js';

export const billingRouter = Router();

const bodySchema = z.object({
  // Decides both the Stripe Checkout UI language and which localized page the
  // user comes back to.
  language: z.enum(SUPPORTED_LANGUAGES).default('en').catch('en'),
});

/**
 * POST /api/billing/checkout-session
 *
 * Returns a Stripe-hosted Checkout URL for the frontend to redirect to. We
 * never see card details; that is the entire point of using Checkout rather
 * than Elements for a test project.
 */
billingRouter.post(
  '/billing/checkout-session',
  attachDemoUser,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { language } = bodySchema.parse(req.body ?? {});

    // Re-subscribing while already active would create a second subscription
    // and charge twice. Refuse rather than let the demo do that by accident.
    const existing = await getSubscriptionForUser(user.id);
    if (toSubscriptionView(existing).isActive) {
      res.status(409).json({
        error: {
          code: 'already_subscribed',
          message: 'This user already has an active subscription.',
        },
      });
      return;
    }

    const session = await createCheckoutSession(user, language);
    res.status(201).json(session);
  }),
);

/**
 * POST /api/billing/portal-session
 *
 * Stripe's hosted portal, so a reviewer can cancel the demo subscription and
 * watch the paywall close again without leaving the app.
 */
billingRouter.post(
  '/billing/portal-session',
  attachDemoUser,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { language } = bodySchema.parse(req.body ?? {});
    const url = await createPortalSession(user, language);
    res.json({ url });
  }),
);
