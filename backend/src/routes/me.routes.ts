import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { attachDemoUser, requireUser } from '../middleware/demo-user.js';
import {
  getSubscriptionForUser,
  toSubscriptionView,
} from '../services/subscription.service.js';

export const meRouter = Router();

/**
 * GET /api/me
 *
 * What the frontend needs to render the header: who is signed in (always the
 * demo user) and whether the paywall is open. Deliberately does not expose
 * Stripe ids — the frontend has no use for them and they are account data.
 */
meRouter.get(
  '/me',
  attachDemoUser,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const subscription = await getSubscriptionForUser(user.id);

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      subscription: toSubscriptionView(subscription),
    });
  }),
);
