import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

/**
 * One place where an error becomes a response body.
 *
 * Known errors (HttpError, ZodError) carry a status and a message meant for a
 * user. Everything else is a bug: it gets logged with its stack and reported as
 * a bare 500, so internals never reach the client.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route matches ${req.method} ${req.path}.` },
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Express requires the 4-arity signature; if headers are already out the
  // door the only correct move is to let Express destroy the socket.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'The request parameters are not valid.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  logger.error('unhandled error', {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong on our side.',
      ...(env.isProduction
        ? {}
        : { details: error instanceof Error ? error.message : String(error) }),
    },
  });
}
