import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so a rejection is forwarded to the Express
 * error middleware. Express 4 ignores returned promises — without this, a
 * throw in an async handler becomes an unhandled rejection, which the
 * process-level handler in index.ts turns into a server exit.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
