import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, UnauthorizedError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

/** Validate and replace req.body / req.query / req.params using a Zod schema. */
export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req, _res, next) => {
    try {
      const parsed = schema.parse(req.query ?? {});
      (req as unknown as { validatedQuery: z.infer<T> }).validatedQuery = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validatedQuery<T>(req: Request): T {
  return (req as unknown as { validatedQuery: T }).validatedQuery;
}

/** Central error handler: consistent JSON shape, no stack traces to clients. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'The submitted data is invalid',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }
  if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type: string }).type === 'entity.parse.failed'
  ) {
    res
      .status(400)
      .json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
    return;
  }
  logger.error('Unhandled request error', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  res.status(500).json({
    error: { code: 'internal_error', message: 'An unexpected error occurred. Please try again.' },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
}

/** Wrap async handlers so rejected promises reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export { UnauthorizedError, ForbiddenError };
