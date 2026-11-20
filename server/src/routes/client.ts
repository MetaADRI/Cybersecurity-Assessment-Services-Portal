import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import {
  clientProfileSchema,
  freeRunQuerySchema,
  serviceRequestCreateSchema,
} from '../../../shared/client-schemas';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validation';
import { wrap } from '../utils/async';
import { CLIENT_SESSION_COOKIE, endClientSession, requireClient } from '../middleware/client-auth';
import { findClientById, toClientUser, updateClientProfile } from '../repositories/clients';
import {
  getFreeRunForClient,
  latestRunForClient,
  listFreeRunsForClient,
} from '../repositories/free-runs';
import { getReportForClient, listReportsForClient } from '../repositories/client-reports';
import {
  createServiceRequest,
  findOpenClientRequest,
  listClientRequests,
} from '../repositories/service-requests';
import { getCatalogItem, listCatalog } from '../repositories/service-catalog';
import { recordAudit } from '../repositories/audit';
import { resolveFreeReportPath } from '../services/free-report';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import type { ClientDashboardData } from '../../../shared/client-types';

export function clientRouter(): Router {
  const router = Router();
  router.use(requireClient);

  router.get(
    '/me',
    wrap(async (req, res) => {
      res.json({
        user: req.clientUser,
        csrfToken: req.clientCsrfToken,
        expiresAt: req.clientSessionExpiresAt,
      });
    }),
  );

  router.patch(
    '/profile',
    validateBody(clientProfileSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof clientProfileSchema>;
      await updateClientProfile(req.db, req.clientUser!.id, body);
      const client = await findClientById(req.db, req.clientUser!.id);
      if (!client) throw new NotFoundError('Client account not found');
      await recordAudit(req.db, {
        actorEmail: client.email,
        action: 'client.profile_updated',
        entityType: 'client',
        entityId: client.id,
        summary: `${client.email} updated their profile`,
      });
      res.json({ user: toClientUser(client) });
    }),
  );

  router.post(
    '/logout',
    wrap(async (req, res) => {
      await endClientSession(req.db, req.clientSessionId);
      res.clearCookie(CLIENT_SESSION_COOKIE, { path: '/' });
      await recordAudit(req.db, {
        actorEmail: req.clientUser!.email,
        action: 'client.logout',
        entityType: 'client',
        entityId: req.clientUser!.id,
        summary: `${req.clientUser!.email} signed out of the client portal`,
      });
      res.json({ ok: true });
    }),
  );

  router.get(
    '/dashboard',
    wrap(async (req, res) => {
      const clientId = req.clientUser!.id;
      const catalog = await listCatalog(req.db);
      const latestRun = await latestRunForClient(req.db, clientId);
      const recommendedKeys = latestRun?.result
        ? Array.from(new Set(latestRun.result.findings.map((finding) => finding.serviceKey)))
        : [];
      const paid = catalog.filter((item) => !item.isFree);
      const recommended = recommendedKeys
        .map((key) => paid.find((item) => item.key === key))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, 3);
      const data: ClientDashboardData = {
        user: req.clientUser!,
        latestRun,
        runs: await listFreeRunsForClient(req.db, clientId, 5),
        reports: await listReportsForClient(req.db, clientId),
        requests: await listClientRequests(req.db, clientId),
        recommended: recommended.length > 0 ? recommended : paid.slice(0, 3),
        catalog,
      };
      res.json(data);
    }),
  );

  router.get(
    '/services',
    wrap(async (req, res) => {
      res.json({ items: await listCatalog(req.db) });
    }),
  );

  router.get(
    '/runs',
    validateQuery(freeRunQuerySchema),
    wrap(async (req, res) => {
      const { limit } = validatedQuery<{ limit: number }>(req);
      res.json({ items: await listFreeRunsForClient(req.db, req.clientUser!.id, limit) });
    }),
  );

  router.get(
    '/runs/:id',
    wrap(async (req, res) => {
      const run = await getFreeRunForClient(req.db, req.params.id, req.clientUser!.id);
      if (!run) throw new NotFoundError('Result not found');
      res.json({ run });
    }),
  );

  router.get(
    '/reports',
    wrap(async (req, res) => {
      res.json({ items: await listReportsForClient(req.db, req.clientUser!.id) });
    }),
  );

  router.get(
    '/reports/:id/download',
    wrap(async (req, res) => {
      const found = await getReportForClient(req.db, req.clientUser!.id, req.params.id);
      if (!found) throw new NotFoundError('Report not found');
      const filePath = resolveFreeReportPath(req.env, found.fileName);
      if (!fs.existsSync(filePath)) throw new NotFoundError('This PDF is no longer available');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="OpenDefenders-report.pdf"');
      fs.createReadStream(filePath).pipe(res);
    }),
  );

  router.get(
    '/requests',
    wrap(async (req, res) => {
      res.json({ items: await listClientRequests(req.db, req.clientUser!.id) });
    }),
  );

  router.post(
    '/requests',
    validateBody(serviceRequestCreateSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof serviceRequestCreateSchema>;
      const service = await getCatalogItem(req.db, body.serviceKey);
      if (!service) throw new ValidationError('Choose a valid service');
      const open = await findOpenClientRequest(req.db, req.clientUser!.id, body.serviceKey);
      if (open) {
        throw new ConflictError('You already have an open request for this service');
      }
      const request = await createServiceRequest(req.db, {
        clientId: req.clientUser!.id,
        visitorId: null,
        serviceKey: body.serviceKey,
        message: body.message ? body.message : null,
        contactPreference: body.contactPreference,
      });
      await recordAudit(req.db, {
        actorEmail: req.clientUser!.email,
        action: 'client.service_requested',
        entityType: 'service_request',
        entityId: request.id,
        summary: `${req.clientUser!.email} requested ${service.name}`,
        metadata: { serviceKey: body.serviceKey },
      });
      res.status(201).json({ request });
    }),
  );

  return router;
}
