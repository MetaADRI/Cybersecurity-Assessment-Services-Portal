import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validation';
import { wrap } from '../utils/async';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  categoryWeightsSchema,
  controlLibrarySchema,
  paginationSchema,
} from '../../../shared/schemas';
import {
  getScoringSettings,
  listCategories,
  listControls,
  setCategoryWeights,
  setScoringSettings,
  updateControl,
} from '../repositories/settings';
import { listAudit, recordAudit } from '../repositories/audit';
import { validateWeights, ScoreConfigError } from '../scoring/engine';
import { NotFoundError, ValidationError } from '../utils/errors';

export function settingsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/scoring',
    wrap(async (req, res) => {
      res.json({
        settings: await getScoringSettings(req.db),
        categories: await listCategories(req.db),
        weights: Object.fromEntries(
          (await listCategories(req.db)).map((c) => [c.categoryKey, c.weight]),
        ),
      });
    }),
  );

  router.put(
    '/scoring',
    requireRole('admin'),
    validateBody(categoryWeightsSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof categoryWeightsSchema>;
      const known = await listCategories(req.db, true);
      const knownKeys = new Set(known.map((c) => c.categoryKey));
      for (const key of Object.keys(body.weights)) {
        if (!knownKeys.has(key)) {
          throw new ValidationError(`Unknown category "${key}"`, { field: `weights.${key}` });
        }
      }
      try {
        validateWeights(body.weights);
      } catch (err) {
        if (err instanceof ScoreConfigError)
          throw new ValidationError(err.message, { field: 'weights' });
        throw err;
      }
      await setCategoryWeights(req.db, body.weights);
      await setScoringSettings(
        req.db,
        { coverageThreshold: body.coverageThreshold, rubric: body.rubric },
        req.user!.id,
      );
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'settings.scoring_updated',
        entityType: 'settings',
        entityId: 'scoring',
        summary: `Updated scoring configuration (threshold ${body.coverageThreshold}%)`,
        metadata: { weights: body.weights, rubric: body.rubric },
        ip: req.clientIp,
      });
      res.json({
        settings: await getScoringSettings(req.db),
        categories: await listCategories(req.db),
      });
    }),
  );

  router.get(
    '/controls',
    wrap(async (req, res) => {
      res.json({ items: await listControls(req.db, { includeInactive: req.user!.role === 'admin' }) });
    }),
  );

  router.patch(
    '/controls/:id',
    requireRole('admin'),
    validateBody(controlLibrarySchema.partial()),
    wrap(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const control = await updateControl(req.db, req.params.id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        guidance: body.guidance as string | undefined,
        rubric: body.rubric as string | undefined,
        applicability: body.applicability as string | undefined,
        evidenceRequirements: body.evidenceRequirements as string | undefined,
        weight: body.weight as number | undefined,
        active: body.active as boolean | undefined,
      });
      if (!control) throw new NotFoundError('Control not found');
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'settings.control_updated',
        entityType: 'control',
        entityId: control.id,
        summary: `Updated control ${control.controlKey}`,
      });
      res.json({ control });
    }),
  );

  router.get(
    '/audit',
    requireRole('admin'),
    validateQuery(
      paginationSchema.extend({
        entityType: z.string().max(60).optional(),
        entityId: z.string().max(64).optional(),
      }),
    ),
    wrap(async (req, res) => {
      const opts = validatedQuery<{
        page: number;
        pageSize: number;
        entityType?: string;
        entityId?: string;
      }>(req);
      const result = await listAudit(req.db, opts);
      res.json({ ...result, page: opts.page, pageSize: opts.pageSize });
    }),
  );

  return router;
}
