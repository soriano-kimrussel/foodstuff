import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`, { env: env.NODE_ENV });
});

/**
 * Close the HTTP server before the database pool, so requests already in flight
 * can finish instead of failing on a closed connection.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down`);

  server.close(async (error) => {
    if (error) logger.error('error while closing server', { error: String(error) });
    await prisma.$disconnect();
    process.exit(error ? 1 : 0);
  });

  // Do not hang forever on a stuck keep-alive connection.
  setTimeout(() => {
    logger.warn('forcing shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
