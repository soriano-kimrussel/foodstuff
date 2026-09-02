import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Creates the single demo user the app runs as.
 *
 * Idempotent: an upsert on the email, so running it against an already-seeded
 * database is a no-op rather than a unique-constraint error. Deliberately does
 * NOT create a subscription — the paywall should start closed so a reviewer can
 * watch it open after paying.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.DEMO_USER_EMAIL ?? 'demo@example.com';
  const name = process.env.DEMO_USER_NAME ?? 'Demo User';

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name },
  });

  console.log(`Seeded demo user ${user.email} (${user.id})`);

  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
  console.log(
    subscription
      ? `Existing subscription: ${subscription.status}`
      : 'No subscription yet — nutrition values start locked, as intended.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
