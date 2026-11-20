import type { RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import { wrap } from '../utils/async';
import type { Db } from '../database/db';
import type { Env } from '../config/env';
import {
  createSession,
  deleteSession,
  findUserById,
  getSession,
  touchSession,
} from '../repositories/users';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import type { Role } from '../../../shared/constants';
import type { User as AppUser } from '../../../shared/types';

export const SESSION_COOKIE = 'odcmp_session';

declare global {
  namespace Express {
    interface Request {
      db: Db;
      env: Env;
      user?: AppUser;
      sessionId?: string;
      csrfToken?: string;
      clientIp?: string;
    }
  }
}

export interface AuthDeps {
  db: Db;
  env: Env;
}

export function sessionCookieOptions(env: Env) {
  return {
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
  };
}

export async function startSession(
  deps: AuthDeps,
  userId: string,
): Promise<{ token: string; csrfToken: string }> {
  const csrfToken = randomBytes(24).toString('hex');
  const session = await createSession(deps.db, {
    userId,
    csrfToken,
    ttlHours: deps.env.SESSION_TTL_HOURS,
  });
  return { token: session.id, csrfToken };
}

export async function endSession(db: Db, sessionId: string | undefined): Promise<void> {
  if (sessionId) await deleteSession(db, sessionId);
}

/** Populate req.user when a valid session cookie is present. Never rejects. */
export function sessionMiddleware(deps: AuthDeps): RequestHandler {
  return wrap(async (req, _res, next) => {
    const raw = req.cookies?.[SESSION_COOKIE];
    if (typeof raw === 'string' && raw.length > 0) {
      const session = await getSession(deps.db, raw);
      if (session) {
        const user = await findUserById(deps.db, session.userId);
        if (user && user.status === 'active') {
          req.user = user;
          req.sessionId = session.id;
          req.csrfToken = session.csrfToken;
          await touchSession(deps.db, session.id);
        }
      }
    }
    next();
  });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new UnauthorizedError());
  next();
};

/** Role guard enforced on the server regardless of what the client shows. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Your role does not permit this action'));
    }
    next();
  };
}

/** Reviewers can read everything they are shown but never mutate records. */
export const requireWriter: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role === 'reviewer') {
    return next(new ForbiddenError('Read-only reviewers cannot change records'));
  }
  next();
};

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Two complementary CSRF controls:
 *  1. Origin/Referer check for every unsafe request (covers login).
 *  2. Synchroniser token check for authenticated unsafe requests.
 */
export function originGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (!UNSAFE.has(req.method)) return next();
    const origin = req.headers.origin ?? req.headers.referer;
    if (!origin) return next(); // same-origin non-browser client
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return next(new ForbiddenError('Invalid request origin'));
    }
    const allowedHosts = Array.from(allowed).map((o: string) => {
      try {
        return new URL(o).host;
      } catch {
        return o;
      }
    });
    const sameHost = host === req.headers.host;
    if (!sameHost && !allowedHosts.includes(host)) {
      return next(new ForbiddenError('Request origin is not allowed'));
    }
    next();
  };
}

export function csrfGuard(): RequestHandler {
  return (req, _res, next) => {
    if (!UNSAFE.has(req.method)) return next();
    if (!req.user) return next();
    const header = req.get('x-csrf-token');
    if (!header || !req.csrfToken || header !== req.csrfToken) {
      return next(new ForbiddenError('Invalid or missing CSRF token'));
    }
    next();
  };
}
