import type { User } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { resetDemoUserCache } from '../../src/middleware/demo-user.js';

/**
 * Integration-test database helpers.
 *
 * These run against a real MySQL schema, not a mock. The point is to catch the
 * things a mocked Prisma client cannot: a unique constraint that does not fire,
 * a transaction that does not roll back, an enum MySQL rejects. The price is
 * that the suite needs a scratch database — see .env.test.example.
 */

/** Guard against pointing the suite at a database with real data in it. */
export function assertScratchDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!/test/i.test(url)) {
    throw new Error(
      `Refusing to run integration tests against "${url}": the database name must ` +
        'contain "test", because these tests truncate every table. See .env.test.example.',
    );
  }
}

/**
 * Empty every table between tests.
 *
 * Deletes children before parents rather than disabling foreign keys and
 * truncating. The obvious version of this — `SET FOREIGN_KEY_CHECKS = 0`
 * followed by TRUNCATE — is subtly broken with a connection pool: the SET
 * applies to one session, and Prisma is free to run the TRUNCATE on a
 * different connection that still has the checks on. It fails only when the
 * pool hands out a second connection, which is why it looks like a flake.
 *
 * One $transaction keeps all four deletes on a single connection, in order.
 */
export async function resetDatabase(): Promise<void> {
  assertScratchDatabase();

  await prisma.$transaction([
    prisma.processedWebhookEvent.deleteMany(),
    prisma.search.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // The demo-user middleware memoizes its lookup; a truncated table must
  // invalidate that or every later request resolves a user that no longer
  // exists.
  resetDemoUserCache();
}

/** Create the demo user the app resolves via DEMO_USER_EMAIL. */
export async function seedDemoUser(overrides: Partial<User> = {}): Promise<User> {
  return prisma.user.create({
    data: {
      email: process.env.DEMO_USER_EMAIL ?? 'demo@example.com',
      name: 'Demo User',
      ...overrides,
    },
  });
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
