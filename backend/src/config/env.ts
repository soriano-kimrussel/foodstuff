import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Load .env before reading process.env.
 *
 * Skipped under NODE_ENV=test, where tests/helpers/setup-env.ts has already
 * loaded .env.test and must win. dotenv never overwrites a variable that is
 * already set, so a real environment (Docker, a PaaS) always takes precedence
 * over the file.
 */
if (process.env.NODE_ENV !== 'test') {
  loadDotenv();
}

/**
 * Every environment variable the backend reads, validated once at import time.
 *
 * Failing here rather than at the first request means a missing STRIPE_PRICE_ID
 * is a startup error with a readable message, not a 500 three screens into a
 * demo. Secrets only ever arrive through this module.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  DEMO_USER_EMAIL: z.string().email().default('demo@example.com'),
  DEMO_USER_NAME: z.string().default('Demo User'),

  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_PRICE_ID: z.string().min(1, 'STRIPE_PRICE_ID is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),

  OFF_BASE_URL: z.string().url().default('https://world.openfoodfacts.org'),
  // Full-text search lives on a different host to the product API.
  OFF_SEARCH_BASE_URL: z.string().url().default('https://search.openfoodfacts.org'),
  OFF_USER_AGENT: z
    .string()
    .default('FoodFactsExplorer/1.0 (technical-test; demo@example.com)'),
  OFF_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  OFF_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${detail}\n\nSee .env.example.`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
