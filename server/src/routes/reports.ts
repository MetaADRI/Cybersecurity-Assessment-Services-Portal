import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { reportRequestSchema, paginationSchema } from '../../../shared/schemas';
import { validateBody, validateQuery, validatedQuery } from '../middleware/validation';
import { wrap } from '../utils/async';
import { requireAuth, requireWriter } from '../middleware/auth';
import {
  generateReport,
  getReport,
  listReports,
  reportSnapshot,
  resolveReportPath,
} from '../services/reports';
import { buildReportContent, assertReportable } from '../reports/content';
import { requireAssessment } from '../repositories/assessments';
import { NotFoundError } from '../utils/errors';
import type { ReportType } from '../../../shared/constants';

export function reportsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    validateQuery(
      paginationSchema.extend({
        customerId: z.string().uuid().optional(),
        assessmentId: z.string().uuid().optional(),
      }),
    ),
    wrap(async (req, res) => {
      const opts = validatedQuery<{
        page: number;
        pageSize: number;
        customerId?: string;
        assessmentId?: string;
      }>(req);
      const result = await listReports(req.db, opts);
      res.json({ ...result, page: opts.page, pageSize: opts.pageSize });
    }),
  );

  /** Structured preview of what a report would contain, before any file is written. */
  router.get(
    '/preview',
    validateQuery(
      z.object({
        assessmentId: z.string().uuid(),
        type: z.enum(['executive', 'technical', 'remediation']),
      }),
    ),
    wrap(async (req, res) => {
      const q = validatedQuery<{ assessmentId: string; type: ReportType }>(req);
      const assessment = await requireAssessment(req.db, q.assessmentId);
      assertReportable(assessment);
      const previewKey = 'PREVIEW';
      const content = await buildReportContent(req.db, q.assessmentId, q.type, {
        generatedBy: req.user!.id,
        generatedByName: req.user!.fullName,
        reportKey: previewKey,
      });
      res.json({ content });
    }),
  );

  router.post(
    '/generate',
    requireWriter,
    validateBody(reportRequestSchema),
    wrap(async (req, res) => {
      const body = req.body as z.infer<typeof reportRequestSchema>;
      const { report, content } = await generateReport(
        req.db,
        req.env,
        {
          assessmentId: body.assessmentId,
          type: body.type,
          title: body.title,
        },
        req.user!,
      );
      res.status(201).json({ report, content });
    }),
  );

  router.get(
    '/:id',
    wrap(async (req, res) => {
      const report = await getReport(req.db, req.params.id);
      if (!report) throw new NotFoundError('Report not found');
      res.json({ report, content: reportSnapshot(report.snapshot) });
    }),
  );

  router.get(
    '/:id/download',
    wrap(async (req, res) => {
      const report = await getReport(req.db, req.params.id);
      if (!report) throw new NotFoundError('Report not found');
      if (report.status !== 'generated') {
        throw new NotFoundError('This report failed to generate and has no file');
      }
      const filePath = resolveReportPath(req.env, report.fileName);
      if (!fs.existsSync(filePath)) {
        throw new NotFoundError('The report file is no longer available on disk');
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${report.reportKey}-${report.type}.pdf"`,
      );
      fs.createReadStream(filePath).pipe(res);
    }),
  );

  return router;
}
