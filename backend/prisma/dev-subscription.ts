import 'dotenv/config';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';

/**
 * Grant or revoke the demo user's subscription without going through Stripe.
 *
 * Purely a convenience for reviewing the app: it writes the same row the
 * webhook would, so the paywall can be opened and closed in one command when
 * you do not want to configure Stripe keys and a `stripe listen` tunnel.
 *
 * The real flow is Checkout -> webhook -> this table; this script just skips
 * the first two steps. It is a dev tool and is never imported by the server.
 *
 *   npm run dev:subscribe     # unlock nutritional values
 *   npm run dev:unsubscribe   # lock them again
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const action = process.argv[2];
  if (action !== 'grant' && action !== 'revoke') {
    console.error('Usage: tsx prisma/dev-subscription.ts <grant|revoke>');
    process.exitCode = 1;
    return;
  }

  const email = process.env.DEMO_USER_EMAIL ?? 'demo@example.com';
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`No user with email ${email}. Run "npm run seed" first.`);
    process.exitCode = 1;
    return;
  }

  if (action === 'revoke') {
    const { count } = await prisma.subscription.deleteMany({ where: { userId: user.id } });
    console.log(
      count > 0
        ? 'Subscription removed. Nutritional values are locked again.'
        : 'There was no subscription to remove.',
    );
    return;
  }

  const data = {
    userId: user.id,
    stripeSubscriptionId: 'sub_local_dev',
    stripePriceId: process.env.STRIPE_PRICE_ID ?? 'price_local_dev',
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
  };

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: data,
    update: data,
  });

  console.log(`Subscription active for ${email} until ${data.currentPeriodEnd.toISOString()}.`);
  console.log('Nutritional values are unlocked.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
