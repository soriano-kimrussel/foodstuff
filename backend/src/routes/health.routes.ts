import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const healthRouter = Router();

/**
 * Liveness only — no dependencies touched, so a container orchestrator can
 * tell "the process is up" apart from "the database is down".
 */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

/** Readiness — actually round-trips to MySQL. */
healthRouter.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', database: 'up' });
    } catch {
      res.status(503).json({ status: 'not_ready', database: 'down' });
    }
  }),
);
