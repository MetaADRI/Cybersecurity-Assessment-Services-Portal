import type { Request, RequestHandler } from 'express';
import type { Env } from '../config/env';
import { newVisitorCookieId } from '../security/visitor';

export const VISITOR_COOKIE = 'odcmp_visitor';

declare global {
  namespace Express {
    interface Request {
      visitorCookieId?: string;
    }
  }
}

function visitorCookieOptions(env: Env) {
  return {
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  };
}

/** Give every public visitor a stable, opaque id so free checks can be limited. */
export const visitorContext: RequestHandler = (req: Request, res, next) => {
  const existing = req.cookies?.[VISITOR_COOKIE];
  const valid = typeof existing === 'string' && /^[a-f0-9]{48}$/i.test(existing);
  const cookieId = valid ? existing : newVisitorCookieId();
  if (!valid) res.cookie(VISITOR_COOKIE, cookieId, visitorCookieOptions(req.env));
  req.visitorCookieId = cookieId;
  next();
};
