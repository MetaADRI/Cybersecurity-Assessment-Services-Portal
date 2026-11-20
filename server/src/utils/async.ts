import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wrap an async Express handler so rejected promises reach the error middleware. */
export function wrap(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
