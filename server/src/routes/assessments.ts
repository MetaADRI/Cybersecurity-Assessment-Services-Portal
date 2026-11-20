import { Router } from 'express';
import { z } from 'zod';
import {
  assessmentSchema,
  controlAssessmentSchema,
  paginationSchema,
} from '../../../shared/schemas';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validation';
import { wrap } from '../utils/async';
import { requireAuth, requireWriter } from '../middleware/auth';
import {
  assertAssessmentNotCompleted,
  createAssessment,
  getAssessment,
  listAssessments,
  listControlAssessments,
  requireAssessment,
  updateAssessment,
  upsertControlAssessment,
} from '../repositories/assessments';
import { getControl, getScoringSettings, listControls } from '../repositories/settings';
import { getCustomer } from '../repositories/customers';
import { listFindingsForAssessment } from '../repositories/findings';
import { recordAudit } from '../repositories/audit';
import {
  completeAssessment,
  computeAssessmentScore,
  findPreviousComparable,
} from '../services/scoring';
import { compareScores } from '../scoring/engine';
import { generateRecommendations } from '../scoring/recommendations';
import { CURRENT_METHODOLOGY_VERSION, FINDING_STATUSES } from '../../../shared/constants';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import type { ControlStatus } from '../../../shared/constants';

const listQuerySchema = paginationSchema.extend({
  customerId: z.string().uuid().optional(),
  status: z.enum(['draft', 'in_progress', 'completed', 'archived']).optional(),
});

export function assessmentsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    validateQuery(listQuerySchema),
    wrap(async (req, res) => {
      const opts = validatedQuery<z.infer<typeof listQuerySchema>>(req);
      const result = await listAssessments(req.db, opts);
      res.json({ ...result, page: opts.page, pageSize: opts.pageSize });
    }),
  );

  router.post(
    '/',
    requireWriter,
    validateBody(assessmentSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof assessmentSchema>;
      const customer = await getCustomer(req.db, body.customerId);
      if (!customer) throw new ValidationError('Customer does not exist', { field: 'customerId' });
      if (customer.status === 'archived') {
        throw new ConflictError('Assessments cannot be created for an archived customer');
      }
      const settings = await getScoringSettings(req.db);
      const controls = await listControls(req.db);
      if (controls.length === 0) throw new ConflictError('The control library is empty');

      const assessment = await createAssessment(req.db, {
        customerId: body.customerId,
        title: body.title,
        type: body.type,
        scope: body.scope,
        description: body.description || null,
        assessmentDate: body.assessmentDate,
        assessor: body.assessor,
        status: body.status === 'completed' ? 'draft' : body.status,
        methodologyVersion: CURRENT_METHODOLOGY_VERSION,
        coverageThreshold: settings.coverageThreshold,
        createdBy: req.user!.id,
        controlIds: controls.map((c) => c.id),
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'assessment.created',
        entityType: 'assessment',
        entityId: assessment.id,
        summary: `Created assessment ${assessment.assessmentKey} for ${customer.name}`,
        ip: req.clientIp,
      });
      res.status(201).json({ assessment });
    }),
  );

  router.get(
    '/:id',
    wrap(async (req, res) => {
      const assessment = await requireAssessment(req.db, req.params.id);
      const controls = await listControlAssessments(req.db, assessment.id);
      const score = await computeAssessmentScore(req.db, assessment);
      const findings = await listFindingsForAssessment(req.db, assessment.id);
      res.json({ assessment, controls, score, findings });
    }),
  );

  router.patch(
    '/:id',
    requireWriter,
    validateBody(
      assessmentSchema.partial().extend({
        status: z.enum(['draft', 'in_progress']).optional(),
      }),
    ),
    wrap(async (req, res) => {
      const assessment = await requireAssessment(req.db, req.params.id);
      assertAssessmentNotCompleted(assessment);
      const body = req.body as Record<string, unknown>;
      const updated = await updateAssessment(req.db, assessment.id, {
        title: body.title as string | undefined,
        type: body.type as never,
        scope: body.scope as string | undefined,
        description: (body.description as string | undefined) || undefined,
        assessmentDate: body.assessmentDate as string | undefined,
        assessor: body.assessor as string | undefined,
        status: body.status as never,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'assessment.updated',
        entityType: 'assessment',
        entityId: assessment.id,
        summary: `Updated assessment ${assessment.assessmentKey}`,
      });
      res.json({ assessment: updated });
    }),
  );

  router.post(
    '/:id/controls/:controlId',
    requireWriter,
    validateBody(controlAssessmentSchema),
    wrap(async (req, res) => {
      const assessment = await requireAssessment(req.db, req.params.id);
      assertAssessmentNotCompleted(assessment);
      const control = await getControl(req.db, req.params.controlId);
      if (!control) throw new NotFoundError('Control not found');
      const body = req.body as z.infer<typeof controlAssessmentSchema>;
      if (body.status === 'not_applicable' && !body.justification?.trim()) {
        throw new ValidationError(
          'A justification is required when a control is marked not applicable',
          {
            field: 'justification',
          },
        );
      }
      const settings = await getScoringSettings(req.db);
      const updated = await upsertControlAssessment(req.db, {
        assessmentId: assessment.id,
        controlId: control.id,
        status: body.status as ControlStatus,
        justification: body.justification || null,
        evidenceNotes: body.evidenceNotes || null,
        evidenceRef: body.evidenceRef || null,
        userId: req.user!.id,
        rubric: settings.rubric,
      });
      if (assessment.status === 'draft') {
        await updateAssessment(req.db, assessment.id, { status: 'in_progress' });
      }
      const fresh = await requireAssessment(req.db, assessment.id);
      const score = await computeAssessmentScore(req.db, fresh);
      await updateAssessment(req.db, assessment.id, {
        coveragePct: score.coveragePct,
        provisional: !score.eligible,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'assessment.control_updated',
        entityType: 'assessment',
        entityId: assessment.id,
        summary: `${control.controlKey} set to ${body.status} in ${assessment.assessmentKey}`,
        metadata: { controlId: control.id, status: body.status },
      });
      res.json({
        control: updated,
        score: await computeAssessmentScore(
          req.db,
          await requireAssessment(req.db, assessment.id),
        ),
      });
    }),
  );

  router.get(
    '/:id/score',
    wrap(async (req, res) => {
      const assessment = await requireAssessment(req.db, req.params.id);
      const score = await computeAssessmentScore(req.db, assessment);
      res.json({ score, assessment });
    }),
  );

  router.get(
    '/:id/recommendations',
    wrap(async (req, res) => {
      const assessment = await requireAssessment(req.db, req.params.id);
      const controls = await listControlAssessments(req.db, assessment.id);
      const findings = (await listFindingsForAssessment(req.db, assessment.id)).map((f) => ({
        id: f.id,
        findingKey: f.findingKey,
        title: f.title,
        severity: f.severity,
        status: f.status,
        targetDate: f.targetDate,
        overdue: f.overdue,
        assigneeName: f.assigneeName,
      }));
      const recommendations = generateRecommendations({
        controls: controls.map((c) => ({
          controlKey: c.controlKey,
          controlName: c.controlName,
          categoryName: c.categoryName,
          status: c.status,
          evidenceNotes: c.evidenceNotes,
        })),
        findings,
      });
      res.json({ recommendations });
    }),
  );

  router.post(
    '/:id/complete',
    requireWriter,
    wrap(async (req, res) => {
      const result = await completeAssessment(req.db, req.params.id, req.user!);
      res.json(result);
    }),
  );

  router.post(
    '/:id/reopen',
    requireWriter,
    wrap(async (req, res) => {
      const assessment = await requireAssessment(req.db, req.params.id);
      if (assessment.status !== 'completed') {
        throw new ConflictError('Only completed assessments can be reopened');
      }
      const updated = await updateAssessment(req.db, assessment.id, {
        status: 'in_progress',
        overallScore: null,
        provisional: true,
        scoreSnapshot: null,
        completedAt: null,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'assessment.reopened',
        entityType: 'assessment',
        entityId: assessment.id,
        summary: `Reopened assessment ${assessment.assessmentKey}; its previous snapshot was discarded`,
      });
      res.json({ assessment: updated });
    }),
  );

  router.get(
    '/:id/history',
    wrap(async (req, res) => {
      const assessment = await requireAssessment(req.db, req.params.id);
      const previous =
        assessment.previousAssessmentId != null
          ? await getAssessment(req.db, assessment.previousAssessmentId)
          : await findPreviousComparable(req.db, assessment);

      if (!previous) {
        res.json({
          previous: null,
          current: assessment,
          comparison: null,
          note: 'No comparable completed assessment was found for this scope.',
        });
        return;
      }
      const prevResult = await computeAssessmentScore(req.db, previous);
      const currResult = await computeAssessmentScore(req.db, assessment);
      const comparison = compareScores(prevResult, currResult, {
        previousScope: previous.scope,
        currentScope: assessment.scope,
      });
      const newFindings = await listFindingsForAssessment(req.db, assessment.id);
      const oldFindings = await listFindingsForAssessment(req.db, previous.id);
      const oldKeys = new Set(oldFindings.map((f) => f.findingKey));
      const newKeys = new Set(newFindings.map((f) => f.findingKey));
      res.json({
        previous,
        current: assessment,
        comparison,
        previousScore: prevResult,
        currentScore: currResult,
        newlyDiscovered: newFindings.filter((f) => !oldKeys.has(f.findingKey)),
        resolvedSince: oldFindings.filter(
          (f) => !newKeys.has(f.findingKey) || f.status === 'resolved',
        ),
        remainingHighPriority: newFindings.filter(
          (f) =>
            ['critical', 'high'].includes(f.severity) &&
            !FINDING_STATUSES.slice(3).includes(f.status),
        ),
      });
    }),
  );

  return router;
}
