import { Router } from 'express';
import {
  loginSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
} from '../../../shared/schemas';
import { validateBody } from '../middleware/validation';
import { wrap } from '../utils/async';
import { requireAuth, requireRole, endSession, startSession } from '../middleware/auth';
import { hashPassword, verifyPassword } from '../security/password';
import {
  createUser,
  findUserByEmail,
  findUserById,
  listUsers,
  updateUser,
} from '../repositories/users';
import { recordAudit } from '../repositories/audit';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';

export function authRouter(): Router {
  const router = Router();

  router.post(
    '/login',
    validateBody(loginSchema),
    wrap(async (req, res) => {
      const { email, password } = req.body as { email: string; password: string };
      const user = await findUserByEmail(req.db, email);
      const genericError = new UnauthorizedError('Incorrect email or password');
      if (!user) {
        // Constant-ish work factor so timing does not reveal whether the account exists.
        await hashPassword(password);
        await recordAudit(req.db, {
          actorEmail: email,
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: null,
          summary: `Failed login attempt for ${email}`,
          ip: req.clientIp,
        });
        throw genericError;
      }
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok || user.status !== 'active') {
        await recordAudit(req.db, {
          actorId: user.id,
          actorEmail: user.email,
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: user.id,
          summary: `Failed login attempt for ${user.email}`,
          ip: req.clientIp,
        });
        throw genericError;
      }
      const { token, csrfToken } = await startSession({ db: req.db, env: req.env }, user.id);
      res.cookie('odcmp_session', token, {
        httpOnly: true,
        sameSite: req.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: req.env.NODE_ENV === 'production',
        path: '/',
        maxAge: req.env.SESSION_TTL_HOURS * 3600 * 1000,
      });
      await recordAudit(req.db, {
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        summary: `${user.email} signed in`,
        ip: req.clientIp,
      });
      const { passwordHash: _ph, ...safe } = user;
      void _ph;
      res.json({ user: safe, csrfToken });
    }),
  );

  router.post(
    '/logout',
    wrap(async (req, res) => {
      if (req.sessionId) {
        await endSession(req.db, req.sessionId);
        if (req.user) {
          await recordAudit(req.db, {
            actorId: req.user.id,
            actorEmail: req.user.email,
            action: 'auth.logout',
            entityType: 'user',
            entityId: req.user.id,
            summary: `${req.user.email} signed out`,
          });
        }
      }
      res.clearCookie('odcmp_session', { path: '/' });
      res.json({ ok: true });
    }),
  );

  router.get(
    '/me',
    wrap(async (req, res) => {
      if (!req.user) {
        res.json({ user: null, csrfToken: null });
        return;
      }
      res.json({ user: req.user, csrfToken: req.csrfToken });
    }),
  );

  router.post(
    '/change-password',
    requireAuth,
    validateBody(changePasswordSchema),
    wrap(async (req, res) => {
      const body = req.body as { currentPassword: string; newPassword: string };
      const user = await findUserByEmail(req.db, req.user!.email);
      if (!user) throw new UnauthorizedError();
      const ok = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!ok)
        throw new ValidationError('Current password is incorrect', { field: 'currentPassword' });
      await updateUser(req.db, user.id, { passwordHash: await hashPassword(body.newPassword) });
      await recordAudit(req.db, {
        actorId: user.id,
        actorEmail: user.email,
        action: 'user.password_changed',
        entityType: 'user',
        entityId: user.id,
        summary: `${user.email} changed their own password`,
      });
      res.json({ ok: true });
    }),
  );

  return router;
}

export function usersRouter(): Router {
  const router = Router();

  router.get(
    '/',
    requireAuth,
    requireRole('admin'),
    wrap(async (req, res) => {
      res.json({ items: await listUsers(req.db) });
    }),
  );

  /** Lightweight list used to populate assignee pickers (authenticated users). */
  router.get(
    '/options',
    requireAuth,
    wrap(async (req, res) => {
      res.json({
        items: (await listUsers(req.db))
          .filter((u) => u.status === 'active')
          .map((u) => ({ id: u.id, fullName: u.fullName, role: u.role })),
      });
    }),
  );

  router.post(
    '/',
    requireAuth,
    requireRole('admin'),
    validateBody(createUserSchema),
    wrap(async (req, res) => {
      const body = req.body as { email: string; fullName: string; role: string; password: string };
      if (await findUserByEmail(req.db, body.email)) {
        throw new ConflictError('A user with that email already exists');
      }
      const passwordHash = await hashPassword(body.password);
      const user = await createUser(req.db, {
        email: body.email,
        fullName: body.fullName,
        role: body.role as never,
        passwordHash,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'user.created',
        entityType: 'user',
        entityId: user.id,
        summary: `Created user ${user.email} with role ${user.role}`,
      });
      res.status(201).json({ user });
    }),
  );

  router.patch(
    '/:id',
    requireAuth,
    requireRole('admin'),
    validateBody(updateUserSchema),
    wrap(async (req, res) => {
      const body = req.body as {
        fullName?: string;
        role?: string;
        status?: 'active' | 'disabled';
        password?: string;
      };
      const target = await findUserById(req.db, req.params.id);
      if (!target) throw new NotFoundError('User not found');
      if (
        target.id === req.user!.id &&
        (body.status === 'disabled' || (body.role && body.role !== 'admin'))
      ) {
        throw new ConflictError('You cannot remove your own administrator access');
      }
      const updated = await (async () => {
        const patch: Parameters<typeof updateUser>[2] = {};
        if (body.fullName !== undefined) patch.fullName = body.fullName;
        if (body.role !== undefined) patch.role = body.role as never;
        if (body.status !== undefined) patch.status = body.status;
        if (body.password) patch.passwordHash = await hashPassword(body.password);
        return await updateUser(req.db, target.id, patch);
      })();
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'user.updated',
        entityType: 'user',
        entityId: target.id,
        summary: `Updated user ${target.email}`,
        metadata: { role: body.role, status: body.status, passwordChanged: Boolean(body.password) },
      });
      res.json({ user: updated });
    }),
  );

  return router;
}
