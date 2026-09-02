import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not await async handlers, so a rejected promise inside one
 * becomes an unhandled rejection and the request hangs until it times out.
 * Wrapping every async route in this forwards rejections to the error handler.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
