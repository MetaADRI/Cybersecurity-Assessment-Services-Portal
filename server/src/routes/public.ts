import { Router } from 'express';
import fs from 'node:fs';
import rateLimit from 'express-rate-limit';
import { publicFreeRunSchema } from '../../../shared/client-schemas';
import { validateBody } from '../middleware/validation';
import { wrap } from '../utils/async';
import { visitorContext } from '../middleware/visitor';
import { hashFingerprint, hashIp } from '../security/visitor';
import { listCatalog } from '../repositories/service-catalog';
import {
  createFreeRun,
  completeFreeRun,
  failFreeRun,
  getFreeRunForVisitor,
} from '../repositories/free-runs';
import { getVisitorByCookie, getVisitorById, reserveFreeService } from '../repositories/visitors';
import { getReportForVisitor } from '../repositories/client-reports';
import { recordAudit } from '../repositories/audit';
import { runFreeCheck } from '../free-checks';
import { generateFreeReport, resolveFreeReportPath } from '../services/free-report';
import { AppError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { z } from 'zod';
import type { Db as AppDb } from '../database/db';

export function publicRouter(): Router {
  const router = Router();
  router.use(visitorContext);

  const freeRunLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'rate_limited',
        message: 'Too many checks. Please wait a minute and try again.',
      },
    },
  });

  router.get(
    '/catalog',
    wrap(async (req, res) => {
      res.json({ items: await listCatalog(req.db) });
    }),
  );

  router.post(
    '/free-runs',
    freeRunLimiter,
    validateBody(publicFreeRunSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof publicFreeRunSchema>;
      const cookieId = req.visitorCookieId!;
      const fingerprintHash = body.fingerprintHash
        ? hashFingerprint(body.fingerprintHash, req.env.SESSION_SECRET)
        : null;
      const reservation = await reserveFreeService(req.db, {
        cookieId,
        ipHash: hashIp(req.ip || req.socket.remoteAddress || 'unknown', req.env.SESSION_SECRET),
        fingerprintHash,
        serviceKey: body.serviceKey,
        allowRepeat: req.env.FREE_CHECKS_UNLIMITED,
      });
      if (reservation.blocked) {
        throw new AppError(
          409,
          `You have already used your free check (${reservation.usedService?.replace(/_/g, ' ')}). Create an account to request a deeper review.`,
          'free_service_used',
          { usedService: reservation.usedService },
        );
      }

      const runId = await createFreeRun(req.db, {
        visitorId: reservation.visitor.id,
        serviceKey: body.serviceKey,
        target: body.target ?? null,
        consentConfirmed: body.consentConfirmed,
      });

      try {
        const result = await runFreeCheck(body.serviceKey, body);
        await completeFreeRun(req.db, runId, result);
        const visitor = await getVisitorById(req.db, reservation.visitor.id);
        try {
          await generateFreeReport(req.db, req.env, {
            runId,
            visitorId: reservation.visitor.id,
            clientId: visitor?.client_id ?? null,
          });
        } catch (err) {
          logger.warn('Free report generation failed; result remains available', {
            runId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        await recordAudit(req.db, {
          actorId: null,
          actorEmail: visitor?.email ?? null,
          action: 'free_run.completed',
          entityType: 'free_service_run',
          entityId: runId,
          summary: `Completed free ${body.serviceKey.replace(/_/g, ' ')}`,
          metadata: { score: result.score, serviceKey: body.serviceKey },
          ip: req.clientIp,
        });
        const run = await getFreeRunForVisitor(req.db, runId, reservation.visitor.id);
        res.status(201).json({ run });
      } catch (err) {
        await failFreeRun(req.db, runId);
        throw err;
      }
    }),
  );

  router.get(
    '/free-runs/:id',
    wrap(async (req, res) => {
      const visitorId = await getVisitorId(req);
      const run = await getFreeRunForVisitor(req.db, req.params.id, visitorId);
      if (!run) throw new NotFoundError('That result could not be found');
      res.json({ run });
    }),
  );

  router.post(
    '/free-runs/:id/report',
    wrap(async (req, res) => {
      const visitorId = await getVisitorId(req);
      const run = await getFreeRunForVisitor(req.db, req.params.id, visitorId);
      if (!run) throw new NotFoundError('That result could not be found');
      const existing = await getReportForVisitor(req.db, { runId: run.id, visitorId });
      if (existing) {
        res.json({ ok: true, hasReport: true });
        return;
      }
      const visitor = await getVisitorById(req.db, visitorId);
      await generateFreeReport(req.db, req.env, {
        runId: run.id,
        visitorId,
        clientId: visitor?.client_id ?? null,
      });
      res.status(201).json({ ok: true, hasReport: true });
    }),
  );

  router.get(
    '/free-runs/:id/report',
    wrap(async (req, res) => {
      const visitorId = await getVisitorId(req);
      const found = await getReportForVisitor(req.db, {
        runId: req.params.id,
        visitorId,
      });
      if (!found) throw new NotFoundError('No PDF report is available for this result');
      const filePath = resolveFreeReportPath(req.env, found.fileName);
      if (!fs.existsSync(filePath)) throw new NotFoundError('The PDF is no longer available');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="OpenDefenders-free-check.pdf"');
      fs.createReadStream(filePath).pipe(res);
    }),
  );

  return router;
}

async function getVisitorId(req: { db: AppDb; visitorCookieId?: string }): Promise<string> {
  if (!req.visitorCookieId) throw new NotFoundError('That result could not be found');
  const visitor = await getVisitorByCookie(req.db, req.visitorCookieId);
  if (!visitor) throw new NotFoundError('That result could not be found');
  return visitor.id;
}
