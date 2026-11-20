import type { RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import { wrap } from '../utils/async';
import type { Db } from '../database/db';
import type { Env } from '../config/env';
import {
  CLIENT_SESSION_MINUTES,
  createClientSession as createClientSessionRecord,
  deleteClientSession,
  findClientById,
  getClientSession,
  toClientUser,
  touchClientSession,
} from '../repositories/clients';
import { UnauthorizedError } from '../utils/errors';
import type { ClientUser as AppClientUser } from '../../../shared/client-types';

export const CLIENT_SESSION_COOKIE = 'odcmp_client_session';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

declare global {
  namespace Express {
    interface Request {
      clientUser?: AppClientUser;
      clientSessionId?: string;
      clientCsrfToken?: string;
      clientSessionExpiresAt?: string;
    }
  }
}

export function clientSessionCookieOptions(env: Env) {
  return {
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: CLIENT_SESSION_MINUTES * 60 * 1000,
  };
}

export async function startClientSession(
  db: Db,
  clientId: string,
): Promise<{ token: string; csrfToken: string; expiresAt: string }> {
  const csrfToken = randomBytes(24).toString('hex');
  const session = await createClientSessionRecord(db, { clientId, csrfToken });
  return { token: session.id, csrfToken, expiresAt: session.expiresAt };
}

export async function endClientSession(db: Db, sessionId: string | undefined): Promise<void> {
  if (sessionId) await deleteClientSession(db, sessionId);
}

/** Populate req.clientUser for an unexpired, verified client session. */
export function clientSessionMiddleware(deps: { db: Db; env: Env }): RequestHandler {
  return wrap(async (req, res, next) => {
    const raw = req.cookies?.[CLIENT_SESSION_COOKIE];
    if (typeof raw !== 'string' || raw.length === 0) return next();

    const session = await getClientSession(deps.db, raw);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      if (session) await deleteClientSession(deps.db, session.id);
      res.clearCookie(CLIENT_SESSION_COOKIE, { path: '/' });
      return next();
    }

    const client = await findClientById(deps.db, session.clientId);
    if (!client || !client.active || !client.emailVerified) {
      await deleteClientSession(deps.db, session.id);
      res.clearCookie(CLIENT_SESSION_COOKIE, { path: '/' });
      return next();
    }

    await touchClientSession(deps.db, session.id);
    const refreshed = await getClientSession(deps.db, session.id);
    req.clientUser = toClientUser(client);
    req.clientSessionId = session.id;
    req.clientCsrfToken = session.csrfToken;
    req.clientSessionExpiresAt = refreshed?.expiresAt ?? session.expiresAt;
    res.cookie(CLIENT_SESSION_COOKIE, raw, clientSessionCookieOptions(deps.env));
    next();
  });
}

export const requireClient: RequestHandler = (req, _res, next) => {
  if (!req.clientUser) return next(new UnauthorizedError('Client sign-in required'));
  next();
};

export function clientCsrfGuard(): RequestHandler {
  return (req, _res, next) => {
    if (!UNSAFE.has(req.method)) return next();
    if (!req.clientUser) return next();
    const header = req.get('x-csrf-token');
    if (!header || !req.clientCsrfToken || header !== req.clientCsrfToken) {
      return next(new UnauthorizedError('Invalid or missing CSRF token'));
    }
    next();
  };
}
