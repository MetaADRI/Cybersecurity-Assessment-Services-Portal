import { Router } from 'express';
import { z } from 'zod';
import { customerSchema, paginationSchema } from '../../../shared/schemas';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validation';
import { wrap } from '../utils/async';
import { requireAuth, requireWriter } from '../middleware/auth';
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from '../repositories/customers';
import { listAssessments } from '../repositories/assessments';
import { findingCounts, listFindings, severityBreakdown } from '../repositories/findings';
import { recordAudit } from '../repositories/audit';
import { NotFoundError } from '../utils/errors';

const listQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'archived']).optional(),
});

export function customersRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    validateQuery(listQuerySchema),
    wrap(async (req, res) => {
      const opts = validatedQuery<z.infer<typeof listQuerySchema>>(req);
      const result = await listCustomers(req.db, opts);
      res.json({ ...result, page: opts.page, pageSize: opts.pageSize });
    }),
  );

  router.post(
    '/',
    requireWriter,
    validateBody(customerSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof customerSchema>;
      const customer = await createCustomer(req.db, {
        name: body.name,
        description: body.description || null,
        industry: body.industry,
        contactName: body.contactName || null,
        contactEmail: body.contactEmail || null,
        phone: body.phone || null,
        scope: body.scope || null,
        createdBy: req.user!.id,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        summary: `Created customer ${customer.name}`,
        ip: req.clientIp,
      });
      res.status(201).json({ customer });
    }),
  );

  router.get(
    '/:id',
    wrap(async (req, res) => {
      const customer = await getCustomer(req.db, req.params.id);
      if (!customer) throw new NotFoundError('Customer not found');
      const counts = await findingCounts(req.db, customer.id);
      const scores = await listAssessments(req.db, {
        page: 1,
        pageSize: 50,
        customerId: customer.id,
        status: 'completed',
        dir: 'desc',
      });
      res.json({
        customer,
        counts,
        severities: await severityBreakdown(req.db, customer.id),
        completedAssessments: scores.items.map((a) => ({
          id: a.id,
          assessmentKey: a.assessmentKey,
          title: a.title,
          assessmentDate: a.assessmentDate,
          score: a.overallScore,
          coveragePct: a.coveragePct,
          scope: a.scope,
          methodologyVersion: a.methodologyVersion,
        })),
      });
    }),
  );

  router.patch(
    '/:id',
    requireWriter,
    validateBody(customerSchema.partial()),
    wrap(async (req, res) => {
      const body = req.body as Partial<z.infer<typeof customerSchema>>;
      const existing = await getCustomer(req.db, req.params.id);
      if (!existing) throw new NotFoundError('Customer not found');
      const customer = await updateCustomer(req.db, existing.id, {
        ...body,
        description: body.description === undefined ? undefined : body.description || null,
        contactEmail: body.contactEmail === undefined ? undefined : body.contactEmail || null,
        phone: body.phone === undefined ? undefined : body.phone || null,
        scope: body.scope === undefined ? undefined : body.scope || null,
        contactName: body.contactName === undefined ? undefined : body.contactName || null,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: existing.id,
        summary: `Updated customer ${customer?.name ?? existing.name}`,
        ip: req.clientIp,
      });
      res.json({ customer });
    }),
  );

  router.post(
    '/:id/archive',
    requireWriter,
    wrap(async (req, res) => {
      const existing = await getCustomer(req.db, req.params.id);
      if (!existing) throw new NotFoundError('Customer not found');
      const customer = await updateCustomer(req.db, existing.id, { status: 'archived' });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'customer.archived',
        entityType: 'customer',
        entityId: existing.id,
        summary: `Archived customer ${existing.name} (history preserved)`,
        ip: req.clientIp,
      });
      res.json({ customer });
    }),
  );

  router.post(
    '/:id/restore',
    requireWriter,
    wrap(async (req, res) => {
      const existing = await getCustomer(req.db, req.params.id);
      if (!existing) throw new NotFoundError('Customer not found');
      const customer = await updateCustomer(req.db, existing.id, { status: 'active' });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'customer.restored',
        entityType: 'customer',
        entityId: existing.id,
        summary: `Restored customer ${existing.name}`,
      });
      res.json({ customer });
    }),
  );

  router.get(
    '/:id/assessments',
    wrap(async (req, res) => {
      const customer = await getCustomer(req.db, req.params.id);
      if (!customer) throw new NotFoundError('Customer not found');
      const result = await listAssessments(req.db, {
        page: 1,
        pageSize: 100,
        customerId: customer.id,
        dir: 'desc',
      });
      res.json(result);
    }),
  );

  router.get(
    '/:id/findings',
    validateQuery(paginationSchema),
    wrap(async (req, res) => {
      const customer = await getCustomer(req.db, req.params.id);
      if (!customer) throw new NotFoundError('Customer not found');
      const opts = validatedQuery<z.infer<typeof paginationSchema>>(req);
      const result = await listFindings(req.db, { ...opts, customerId: customer.id });
      res.json({ ...result, page: opts.page, pageSize: opts.pageSize });
    }),
  );

  return router;
}
