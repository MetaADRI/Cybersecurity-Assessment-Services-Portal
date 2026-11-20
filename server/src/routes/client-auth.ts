import { Router } from 'express';
import { z } from 'zod';
import {
  clientLoginSchema,
  clientSignupSchema,
  clientVerifySchema,
} from '../../../shared/client-schemas';
import { validateBody } from '../middleware/validation';
import { wrap } from '../utils/async';
import {
  CLIENT_SESSION_COOKIE,
  clientSessionCookieOptions,
  startClientSession,
} from '../middleware/client-auth';
import { visitorContext } from '../middleware/visitor';
import { hashPassword, verifyPassword } from '../security/password';
import { hashVerificationCode, newVerificationCode } from '../security/visitor';
import {
  consumeVerification,
  createClient,
  createVerificationCode,
  findClientByEmail,
  latestVerification,
  markClientVerified,
  recordLoginFailure,
  recordLoginSuccess,
  recordVerificationAttempt,
  toClientUser,
} from '../repositories/clients';
import { linkVisitorToClient } from '../repositories/visitors';
import { recordAudit } from '../repositories/audit';
import { AppError, ConflictError, UnauthorizedError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { ClientWithSecret } from '../repositories/clients';

async function issueCode(
  db: Parameters<typeof createVerificationCode>[0],
  env: { NODE_ENV: string; SESSION_SECRET: string },
  client: ClientWithSecret,
): Promise<string | undefined> {
  const code = newVerificationCode();
  await createVerificationCode(db, {
    clientId: client.id,
    email: client.email,
    codeHash: hashVerificationCode(client.id, code, env.SESSION_SECRET),
    ttlMinutes: 15,
  });
  if (env.NODE_ENV !== 'production') {
    logger.info('Client verification code (development only)', { email: client.email, code });
    return code;
  }
  // Production email delivery is intentionally not wired yet; see README/limitations.
  logger.warn('Client verification code generated but no email provider is configured', {
    clientId: client.id,
  });
  return undefined;
}

export function clientAuthRouter(): Router {
  const router = Router();
  router.use(visitorContext);

  router.post(
    '/signup',
    validateBody(clientSignupSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof clientSignupSchema>;
      if (await findClientByEmail(req.db, body.email)) {
        throw new ConflictError('An account with that email already exists. Sign in instead.');
      }
      const client = await createClient(req.db, {
        name: body.name,
        email: body.email,
        company: body.company,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
      });
      if (req.visitorCookieId) {
        await linkVisitorToClient(req.db, {
          cookieId: req.visitorCookieId,
          clientId: client.id,
          email: client.email,
        });
      }
      const devCode = await issueCode(req.db, req.env, client);
      await recordAudit(req.db, {
        actorEmail: client.email,
        action: 'client.signup',
        entityType: 'client',
        entityId: client.id,
        summary: `Client account created for ${client.email}`,
        ip: req.clientIp,
      });
      res.status(201).json({ requiresVerification: true, email: client.email, devCode });
    }),
  );

  router.post(
    '/resend-code',
    validateBody(z.object({ email: z.string().trim().toLowerCase().email().max(254) })),
    wrap(async (req, res) => {
      const { email } = req.body as { email: string };
      const client = await findClientByEmail(req.db, email);
      if (client && !client.emailVerified) {
        await issueCode(req.db, req.env, client);
      }
      res.json({ ok: true });
    }),
  );

  router.post(
    '/verify',
    validateBody(clientVerifySchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof clientVerifySchema>;
      const client = await findClientByEmail(req.db, body.email);
      if (!client) throw new ValidationError('That verification code is invalid or has expired');
      if (client.emailVerified) {
        res.json({ user: toClientUser(client), alreadyVerified: true });
        return;
      }
      const verification = await latestVerification(req.db, client.id);
      if (!verification) {
        throw new ValidationError('That verification code is invalid or has expired');
      }
      if (Date.parse(verification.expires_at) <= Date.now()) {
        await consumeVerification(req.db, verification.id);
        throw new ValidationError('That verification code has expired. Request a new one.');
      }
      if (verification.attempts >= 5) {
        await consumeVerification(req.db, verification.id);
        throw new ValidationError('Too many attempts. Request a new verification code.');
      }
      const expected = hashVerificationCode(client.id, body.code, req.env.SESSION_SECRET);
      if (verification.code_hash !== expected) {
        await recordVerificationAttempt(req.db, verification.id);
        throw new ValidationError('That verification code is incorrect');
      }
      await consumeVerification(req.db, verification.id);
      await markClientVerified(req.db, client.id);
      if (req.visitorCookieId) {
        await linkVisitorToClient(req.db, {
          cookieId: req.visitorCookieId,
          clientId: client.id,
          email: client.email,
        });
      }
      const session = await startClientSession(req.db, client.id);
      res.cookie(CLIENT_SESSION_COOKIE, session.token, clientSessionCookieOptions(req.env));
      await recordAudit(req.db, {
        actorEmail: client.email,
        action: 'client.verified',
        entityType: 'client',
        entityId: client.id,
        summary: `Client email verified for ${client.email}`,
        ip: req.clientIp,
      });
      res.json({
        user: toClientUser(client),
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      });
    }),
  );

  router.post(
    '/login',
    validateBody(clientLoginSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof clientLoginSchema>;
      const client = await findClientByEmail(req.db, body.email);
      const genericError = new UnauthorizedError('Incorrect email or password');
      if (!client) {
        await hashPassword(body.password);
        await recordAudit(req.db, {
          actorEmail: body.email,
          action: 'client.login_failed',
          entityType: 'client',
          entityId: null,
          summary: `Failed client login attempt for ${body.email}`,
          ip: req.clientIp,
        });
        throw genericError;
      }
      if (client.lockedUntil && Date.parse(client.lockedUntil) > Date.now()) {
        throw new AppError(
          429,
          'Too many failed attempts. Try again in a few minutes.',
          'account_locked',
        );
      }
      const ok = await verifyPassword(body.password, client.passwordHash);
      if (!ok || !client.active) {
        await recordLoginFailure(req.db, client.id);
        await recordAudit(req.db, {
          actorEmail: client.email,
          action: 'client.login_failed',
          entityType: 'client',
          entityId: client.id,
          summary: `Failed client login attempt for ${client.email}`,
          ip: req.clientIp,
        });
        throw genericError;
      }
      if (!client.emailVerified) {
        const devCode = await issueCode(req.db, req.env, client);
        throw new AppError(403, 'Verify your email address to continue.', 'email_unverified', {
          email: client.email,
          devCode,
        });
      }
      await recordLoginSuccess(req.db, client.id);
      if (req.visitorCookieId) {
        await linkVisitorToClient(req.db, {
          cookieId: req.visitorCookieId,
          clientId: client.id,
          email: client.email,
        });
      }
      const session = await startClientSession(req.db, client.id);
      res.cookie(CLIENT_SESSION_COOKIE, session.token, clientSessionCookieOptions(req.env));
      await recordAudit(req.db, {
        actorEmail: client.email,
        action: 'client.login',
        entityType: 'client',
        entityId: client.id,
        summary: `${client.email} signed in to the client portal`,
        ip: req.clientIp,
      });
      res.json({
        user: toClientUser(client),
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      });
    }),
  );

  return router;
}
