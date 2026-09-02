/**
 * Runs before any test module is imported.
 *
 * src/config/env.ts validates process.env at import time and throws if
 * something is missing, so the environment has to be complete before the first
 * `import` of anything under src/. Vitest's `setupFiles` is the only hook that
 * runs early enough.
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envTest = resolve(process.cwd(), '.env.test');
if (existsSync(envTest)) {
  config({ path: envTest, override: true });
}

process.env.NODE_ENV = 'test';

// Defaults so the unit tests run with no .env.test at all. The integration
// tests need a real DATABASE_URL and say so clearly when it is missing.
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.STRIPE_PRICE_ID ??= 'price_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_test_secret';
process.env.DEMO_USER_EMAIL ??= 'demo@example.com';
process.env.FRONTEND_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'mysql://root@127.0.0.1:3306/foodfacts_test';
process.env.OFF_CACHE_TTL_SECONDS ??= '0';
