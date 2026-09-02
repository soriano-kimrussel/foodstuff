import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Stands in for authentication.
 *
 * The assignment specifies a single demo user and no login, so this resolves
 * "the current user" by looking up DEMO_USER_EMAIL. It is shaped like real auth
 * middleware — it populates `req.user` and everything downstream reads only
 * that — so swapping it for session or JWT verification touches this file and
 * nothing else.
 *
 * The user is cached in memory: it is one row that never changes during a run,
 * and re-reading it on every request would add a query to the hot path.
 */
let cachedUser: User | null = null;

/** Test helper — drops the memoized user so a truncated database is noticed. */
export function resetDemoUserCache(): void {
  cachedUser = null;
}

export async function loadDemoUser(): Promise<User> {
  if (cachedUser) return cachedUser;

  const user = await prisma.user.findUnique({ where: { email: env.DEMO_USER_EMAIL } });

  if (!user) {
    throw new HttpError(
      503,
      'demo_user_missing',
      `No user found for DEMO_USER_EMAIL "${env.DEMO_USER_EMAIL}". Run "npm run seed".`,
    );
  }

  cachedUser = user;
  return user;
}

export async function attachDemoUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    req.user = await loadDemoUser();
    next();
  } catch (error) {
    next(error);
  }
}

/** Narrow `req.user` for handlers that run behind attachDemoUser. */
export function requireUser(req: Request): User {
  if (!req.user) {
    throw new HttpError(500, 'internal_error', 'User was not resolved for this request.');
  }
  return req.user;
}
