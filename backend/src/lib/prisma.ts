import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * A single PrismaClient for the process.
 *
 * `tsx watch` re-imports modules on every save, which would otherwise open a
 * new connection pool per reload until MySQL refuses them. Stashing the client
 * on globalThis in development keeps exactly one pool alive across reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['error'] : ['warn', 'error'],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
