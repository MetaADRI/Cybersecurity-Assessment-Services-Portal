import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  findingsQuerySchema,
  findingSchema,
  findingBaseSchema,
  progressNoteSchema,
  statusChangeSchema,
} from '../../../shared/schemas';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validation';
import { wrap } from '../utils/async';
import { requireAuth, requireWriter } from '../middleware/auth';
import {
  addActivity,
  changeFindingStatus,
  createFinding,
  findingCounts,
  getFinding,
  listActivities,
  listFindings,
  listHistory,
  requireFinding,
  severityBreakdown,
  updateFinding,
} from '../repositories/findings';
import { getCustomer } from '../repositories/customers';
import { getAssessment } from '../repositories/assessments';
import { listUsers, findUserById } from '../repositories/users';
import { recordAudit } from '../repositories/audit';
import { calculatePriority, priorityFactorsFrom } from '../scoring/priority';
import { toCsv, parseCsv } from '../utils/csv';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import type { Priority, Severity } from '../../../shared/constants';

export function findingsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    validateQuery(findingsQuerySchema),
    wrap(async (req, res) => {
      const opts = validatedQuery<z.infer<typeof findingsQuerySchema>>(req);
      const result = await listFindings(req.db, { ...opts, overdue: opts.overdue === 'true' });
      res.json({
        ...result,
        page: opts.page,
        pageSize: opts.pageSize,
        counts: await findingCounts(req.db, opts.customerId),
        severities: await severityBreakdown(req.db, opts.customerId),
      });
    }),
  );

  router.get(
    '/export',
    validateQuery(findingsQuerySchema),
    wrap(async (req, res) => {
      const opts = validatedQuery<z.infer<typeof findingsQuerySchema>>(req);
      const { items } = await listFindings(req.db, {
        ...opts,
        overdue: opts.overdue === 'true',
        page: 1,
        pageSize: 1000,
      });
      const csv = toCsv(
        [
          'finding_key',
          'title',
          'severity',
          'priority',
          'status',
          'asset',
          'component',
          'discovered_date',
          'target_date',
          'assignee',
          'external_ref',
          'recommended_remediation',
          'description',
        ],
        items.map((f) => [
          f.findingKey,
          f.title,
          f.severity,
          f.priority,
          f.status,
          f.asset,
          f.component,
          f.discoveredDate,
          f.targetDate,
          f.assigneeName,
          f.externalRef,
          f.recommendedRemediation,
          f.description,
        ]),
      );
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'finding.exported',
        entityType: 'finding',
        entityId: null,
        summary: `Exported ${items.length} findings to CSV`,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="odcmp-findings.csv"');
      res.send(csv);
    }),
  );

  router.post(
    '/',
    requireWriter,
    validateBody(findingSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof findingSchema>;
      const customer = await getCustomer(req.db, body.customerId);
      if (!customer) throw new ValidationError('Customer does not exist', { field: 'customerId' });
      if (body.assessmentId) {
        const assessment = await getAssessment(req.db, body.assessmentId);
        if (!assessment)
          throw new ValidationError('Assessment does not exist', { field: 'assessmentId' });
        if (assessment.customerId !== body.customerId) {
          throw new ValidationError('The selected assessment belongs to a different customer', {
            field: 'assessmentId',
          });
        }
      }
      if (body.assigneeId && !(await findUserById(req.db, body.assigneeId))) {
        throw new ValidationError('Assignee does not exist', { field: 'assigneeId' });
      }

      const factors = priorityFactorsFrom({
        severity: body.severity,
        exploitability: body.exploitability,
        exposure: body.exposure,
        businessImpact: body.businessImpact,
        compensatingControls: body.compensatingControls,
      });
      const suggested = calculatePriority(factors);
      const manual = body.priority !== undefined;
      const priority: Priority = manual ? body.priority! : suggested.priority;

      const finding = await createFinding(req.db, {
        customerId: body.customerId,
        assessmentId: body.assessmentId ?? null,
        title: body.title,
        description: body.description,
        asset: body.asset || null,
        component: body.component || null,
        severity: body.severity as Severity,
        priority,
        prioritySource: manual ? 'manual' : 'calculated',
        priorityJustification: body.priorityJustification || null,
        exploitability: body.exploitability,
        exposure: body.exposure,
        businessImpact: body.businessImpact,
        compensatingControls: body.compensatingControls || null,
        evidence: body.evidence || null,
        discoveredDate: body.discoveredDate,
        assigneeId: body.assigneeId ?? null,
        recommendedRemediation: body.recommendedRemediation || null,
        targetDate: body.targetDate || null,
        externalRef: body.externalRef || null,
        createdBy: req.user!.id,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'finding.created',
        entityType: 'finding',
        entityId: finding.id,
        summary: `Created finding ${finding.findingKey} (${finding.severity}, ${finding.priority}) for ${customer.name}`,
        ip: req.clientIp,
      });
      res
        .status(201)
        .json({ finding, suggestedPriority: suggested.priority, suggestedScore: suggested.score });
    }),
  );

  router.get(
    '/:id',
    wrap(async (req, res) => {
      const finding = await getFinding(req.db, req.params.id);
      if (!finding) throw new NotFoundError('Finding not found');
      res.json({
        finding,
        history: await listHistory(req.db, finding.id),
        activities: await listActivities(req.db, finding.id),
        suggestedPriority: calculatePriority(
          priorityFactorsFrom({
            severity: finding.severity,
            exploitability: finding.exploitability,
            exposure: finding.exposure,
            businessImpact: finding.businessImpact,
            compensatingControls: finding.compensatingControls,
          }),
        ),
      });
    }),
  );

  router.patch(
    '/:id',
    requireWriter,
    validateBody(findingBaseSchema.partial()),
    wrap(async (req, res) => {
      const existing = await requireFinding(req.db, req.params.id);
      const body = req.body as Record<string, unknown>;
      const changed: Record<string, unknown> = {};

      if (body.severity !== undefined && body.severity !== existing.severity)
        changed.severity = body.severity;
      if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId)
        changed.assigneeId = body.assigneeId;
      if (body.targetDate !== undefined && body.targetDate !== existing.targetDate)
        changed.targetDate = body.targetDate;

      const nextSeverity = (body.severity as Severity) ?? existing.severity;
      const factors = priorityFactorsFrom({
        severity: nextSeverity,
        exploitability: (body.exploitability as never) ?? existing.exploitability,
        exposure: (body.exposure as never) ?? existing.exposure,
        businessImpact: (body.businessImpact as never) ?? existing.businessImpact,
        compensatingControls:
          (body.compensatingControls as string | null) ?? existing.compensatingControls,
      });
      const suggested = calculatePriority(factors);
      const manualOverride =
        body.priority !== undefined && (body.priority as Priority) !== suggested.priority;

      const patch: Record<string, unknown> = { ...body };
      if (manualOverride) {
        patch.priority = body.priority;
        patch.prioritySource = 'manual';
        patch.priorityJustification =
          (body.priorityJustification as string) ?? existing.priorityJustification;
      } else if (body.priority !== undefined || body.severity !== undefined) {
        patch.priority = suggested.priority;
        patch.prioritySource = 'calculated';
      }
      delete patch.customerId;
      delete patch.discoveredDate;

      const finding = await updateFinding(req.db, existing.id, patch as never);
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'finding.updated',
        entityType: 'finding',
        entityId: existing.id,
        summary: `Updated finding ${existing.findingKey}`,
        metadata: {
          changed,
          priority: {
            from: existing.priority,
            to: finding.priority,
            source: finding.prioritySource,
          },
        },
        ip: req.clientIp,
      });
      res.json({ finding, suggestedPriority: suggested.priority, suggestedScore: suggested.score });
    }),
  );

  router.post(
    '/:id/status',
    requireWriter,
    validateBody(statusChangeSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof statusChangeSchema>;
      const existing = await requireFinding(req.db, req.params.id);
      const finding = await changeFindingStatus(req.db, existing.id, {
        status: body.status,
        note: body.note || null,
        resolutionNotes: body.resolutionNotes || null,
        verificationEvidence: body.verificationEvidence || null,
        riskJustification: body.riskJustification || null,
        riskDecisionMaker: body.riskDecisionMaker || null,
        riskReviewDate: body.riskReviewDate || null,
        changedBy: req.user!.id,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: `finding.status.${body.status}`,
        entityType: 'finding',
        entityId: existing.id,
        summary: `Finding ${existing.findingKey} moved from ${existing.status} to ${finding.status}`,
        ip: req.clientIp,
      });
      res.json({
        finding,
        history: await listHistory(req.db, finding.id),
        counts: await findingCounts(req.db, finding.customerId),
      });
    }),
  );

  router.post(
    '/:id/activities',
    requireWriter,
    validateBody(progressNoteSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof progressNoteSchema>;
      const existing = await requireFinding(req.db, req.params.id);
      const activity = await addActivity(req.db, {
        findingId: existing.id,
        body: body.body,
        authorId: req.user!.id,
      });
      await recordAudit(req.db, {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'finding.activity_added',
        entityType: 'finding',
        entityId: existing.id,
        summary: `Added a progress note to ${existing.findingKey}`,
      });
      res.status(201).json({ activity });
    }),
  );

  router.get(
    '/:id/history',
    wrap(async (req, res) => {
      const existing = await getFinding(req.db, req.params.id);
      if (!existing) throw new NotFoundError('Finding not found');
      res.json({
        history: await listHistory(req.db, existing.id),
        activities: await listActivities(req.db, existing.id),
      });
    }),
  );

  return router;
}

const CSV_HEADERS = [
  'title',
  'description',
  'severity',
  'customer_id',
  'asset',
  'component',
  'discovered_date',
  'target_date',
  'external_ref',
  'recommended_remediation',
  'assignee_email',
];

/** Only these columns are mandatory; the rest are optional. */
const REQUIRED_CSV_HEADERS = ['title', 'description', 'severity', 'customer_id', 'discovered_date'];

export function importRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/template',
    wrap(async (_req, res) => {
      const csv = toCsv(CSV_HEADERS, [
        [
          'Example: unpatched web server (replace with real evidence)',
          'Describe the observed condition and how it was verified.',
          'high',
          'CUSTOMER-UUID',
          'srv-web-01',
          'Apache httpd',
          '2026-10-01',
          '2026-10-29',
          'CVE-0000-0000',
          'Apply the vendor patch and verify.',
          'analyst@example.com',
        ],
      ]);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="odcmp-findings-template.csv"');
      res.send(csv);
    }),
  );

  const previewSchema = z.object({
    csv: z.string().min(1, 'No CSV content was provided').max(2_000_000),
    customerId: z.string().uuid(),
    assessmentId: z.string().uuid().nullable().optional(),
  });

  router.post(
    '/preview',
    requireWriter,
    validateBody(previewSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof previewSchema>;
      const customer = await getCustomer(req.db, body.customerId);
      if (!customer) throw new ValidationError('Customer does not exist', { field: 'customerId' });
      const result = await importServicePreview(req, body);
      res.json(result);
    }),
  );

  const commitSchema = previewSchema.extend({
    confirmed: z.literal(true),
    skippedRows: z.array(z.number().int().min(0)).default([]),
  });

  router.post(
    '/commit',
    requireWriter,
    validateBody(commitSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof commitSchema>;
      const result = await importServiceCommit(req, body);
      res.json(result);
    }),
  );

  return router;
}

// --- import implementation (kept close to the routes so validation is shared) ---

interface ParsedRow {
  rowNumber: number;
  values: Record<string, string>;
}

async function importServicePreview(
  req: Request,
  body: { csv: string; customerId: string; assessmentId?: string | null },
): Promise<{
  headers: string[];
  rows: ParsedRow[];
  errors: { row: number; message: string }[];
  duplicates: { row: number; key: string }[];
  customers: number;
}> {
  const parsed = parseCsv(body.csv);
  const errors = parsed.errors.map((m) => ({ row: 0, message: m }));
  const missing = REQUIRED_CSV_HEADERS.filter((h) => !parsed.headers.includes(h));
  for (const h of missing) errors.push({ row: 1, message: `Missing required column "${h}"` });
  if (missing.length > 0)
    return { headers: parsed.headers, rows: [], errors, duplicates: [], customers: 0 };

  const required = ['title', 'description', 'severity', 'customer_id'];
  const rows: ParsedRow[] = [];
  const duplicates: { row: number; key: string }[] = [];
  const severities = ['critical', 'high', 'medium', 'low', 'informational'];
  const existingTitles = new Set(
    (
      await req.db
        .prepare('SELECT lower(title) AS t FROM findings WHERE customer_id = ?')
        .all<{ t: string }>(body.customerId)
    ).map((r) => r.t),
  );

  parsed.rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const values: Record<string, string> = {};
    parsed.headers.forEach((h, i) => {
      values[h] = (cells[i] ?? '').trim();
    });
    let invalid = false;
    for (const r of required) {
      if (!values[r]) {
        errors.push({ row: rowNumber, message: `Column "${r}" is required` });
        invalid = true;
      }
    }
    if (values.severity && !severities.includes(values.severity.toLowerCase())) {
      errors.push({
        row: rowNumber,
        message: `severity must be one of ${severities.join(', ')} (got "${values.severity}")`,
      });
      invalid = true;
    }
    if (values.customer_id && values.customer_id !== body.customerId) {
      errors.push({
        row: rowNumber,
        message: 'customer_id does not match the selected customer',
      });
      invalid = true;
    }
    if (values.discovered_date && !/^\d{4}-\d{2}-\d{2}$/.test(values.discovered_date)) {
      errors.push({ row: rowNumber, message: 'discovered_date must be YYYY-MM-DD' });
      invalid = true;
    }
    if (values.target_date && !/^\d{4}-\d{2}-\d{2}$/.test(values.target_date)) {
      errors.push({ row: rowNumber, message: 'target_date must be YYYY-MM-DD' });
      invalid = true;
    }
    if (invalid) return;
    if (existingTitles.has(values.title.toLowerCase())) {
      duplicates.push({ row: rowNumber, key: values.title });
      return;
    }
    rows.push({ rowNumber, values });
  });

  return { headers: parsed.headers, rows, errors, duplicates, customers: 1 };
}

async function importServiceCommit(
  req: Request,
  body: {
    csv: string;
    customerId: string;
    assessmentId?: string | null;
    skippedRows: number[];
  },
): Promise<{ imported: number; errors: { row: number; message: string }[] }> {
  const preview = await importServicePreview(req, body);
  if (preview.errors.length > 0) {
    throw new ValidationError('The file contains errors and was not imported', {
      errors: preview.errors,
    });
  }
  const skipped = new Set(body.skippedRows);
  const users = await listUsers(req.db);
  const results = { imported: 0, errors: [] as { row: number; message: string }[] };

  const tx = req.db.transaction(async () => {
    for (const [index, row] of preview.rows.entries()) {
      if (skipped.has(index)) continue;
      const v = row.values;
      const assignee = v.assignee_email
        ? users.find((u) => u.email === v.assignee_email.toLowerCase())
        : undefined;
      const factors = priorityFactorsFrom({
        severity: v.severity.toLowerCase() as Severity,
      });
      const suggested = calculatePriority(factors);
      try {
        await createFinding(req.db, {
          customerId: body.customerId,
          assessmentId: body.assessmentId ?? null,
          title: v.title,
          description: v.description,
          severity: v.severity.toLowerCase() as Severity,
          priority: suggested.priority,
          prioritySource: 'calculated',
          exploitability: 'unknown',
          exposure: 'unknown',
          businessImpact: 'unknown',
          asset: v.asset || null,
          component: v.component || null,
          evidence: null,
          discoveredDate: v.discovered_date,
          assigneeId: assignee?.id ?? null,
          recommendedRemediation: v.recommended_remediation || null,
          targetDate: v.target_date || null,
          externalRef: v.external_ref || null,
          createdBy: req.user!.id,
        });
        results.imported += 1;
      } catch (err) {
        results.errors.push({
          row: row.rowNumber,
          message: err instanceof Error ? err.message : 'Import failed',
        });
        throw err;
      }
    }
  });

  try {
    await tx();
  } catch (err) {
    if (results.errors.length === 0) {
      results.errors.push({
        row: 0,
        message: err instanceof Error ? err.message : 'Import failed',
      });
    }
    results.imported = 0;
    throw new ConflictError('Import failed and no records were created', {
      errors: results.errors,
    });
  }

  await recordAudit(req.db, {
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'finding.imported',
    entityType: 'finding',
    entityId: null,
    summary: `Imported ${results.imported} findings from CSV`,
    ip: req.clientIp,
  });
  return results;
}
