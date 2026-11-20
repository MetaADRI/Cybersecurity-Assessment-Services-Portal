import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../database/db';
import type { Env } from '../config/env';
import { buildReportContent, assertReportable, type ReportContent } from '../reports/content';
import { renderReportPdf } from '../reports/pdf';
import { requireAssessment } from '../repositories/assessments';
import { recordAudit } from '../repositories/audit';
import { nextSequence } from '../database/db';
import { newId, nowIso } from '../utils/time';
import { NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { ReportType } from '../../../shared/constants';
import type { ReportRecord } from '../../../shared/types';

interface ReportRow {
  id: string;
  report_key: string;
  type: ReportType;
  title: string;
  customer_id: string;
  assessment_id: string | null;
  file_name: string;
  file_size: number;
  status: 'generated' | 'failed';
  error_message: string | null;
  snapshot_json: string | null;
  generated_at: string;
  generated_by: string | null;
  customer_name?: string;
  assessment_title?: string | null;
  generated_by_name?: string | null;
}

function mapReport(row: ReportRow): ReportRecord {
  return {
    id: row.id,
    reportKey: row.report_key,
    type: row.type,
    title: row.title,
    customerId: row.customer_id,
    customerName: row.customer_name,
    assessmentId: row.assessment_id,
    assessmentTitle: row.assessment_title ?? null,
    fileName: row.file_name,
    fileSize: row.file_size,
    status: row.status,
    errorMessage: row.error_message,
    snapshot: row.snapshot_json,
    generatedAt: row.generated_at,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name ?? null,
  };
}

const REPORT_SELECT = `
  SELECT r.*, c.name AS customer_name, a.title AS assessment_title, u.full_name AS generated_by_name
  FROM reports r
  JOIN customers c ON c.id = r.customer_id
  LEFT JOIN assessments a ON a.id = r.assessment_id
  LEFT JOIN users u ON u.id = r.generated_by`;

export async function listReports(
  db: Db,
  opts: { customerId?: string; assessmentId?: string; page: number; pageSize: number },
): Promise<{ items: ReportRecord[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.customerId) {
    where.push('r.customer_id = ?');
    params.push(opts.customerId);
  }
  if (opts.assessmentId) {
    where.push('r.assessment_id = ?');
    params.push(opts.assessmentId);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM reports r ${clause}`)
    .get<{ c: string | number }>(...params);
  const total = Number(totalRow?.c ?? 0);
  const rows = await db
    .prepare(`${REPORT_SELECT} ${clause} ORDER BY r.generated_at DESC LIMIT ? OFFSET ?`)
    .all<ReportRow>(...params, opts.pageSize, (opts.page - 1) * opts.pageSize);
  return { items: rows.map(mapReport), total };
}

export async function getReport(db: Db, id: string): Promise<ReportRecord | null> {
  const row = await db
    .prepare(`${REPORT_SELECT} WHERE r.id = ? OR r.report_key = ?`)
    .get<ReportRow>(id, id);
  return row ? mapReport(row) : null;
}

export function resolveReportPath(env: Env, fileName: string): string {
  // Only server-generated names of the form RPT-0001.pdf are ever stored.
  if (!/^RPT-\d{4}\.pdf$/.test(fileName)) {
    throw new ValidationError('Invalid report file reference');
  }
  const dir = path.resolve(process.cwd(), env.REPORTS_DIR);
  const full = path.resolve(dir, fileName);
  if (!full.startsWith(dir + path.sep)) {
    throw new ValidationError('Invalid report file reference');
  }
  return full;
}

export interface GenerateReportInput {
  assessmentId: string;
  type: ReportType;
  title?: string;
}

export async function generateReport(
  db: Db,
  env: Env,
  input: GenerateReportInput,
  user: { id: string; email: string; fullName: string } | null,
): Promise<{ report: ReportRecord; content: ReportContent }> {
  const assessment = await requireAssessment(db, input.assessmentId);
  assertReportable(assessment);

  const reportId = newId();
  const reportKey = await db.transaction(() => nextSequence(db, 'report', 'RPT'))();

  let content: ReportContent;
  try {
    content = await buildReportContent(db, input.assessmentId, input.type, {
      generatedBy: user?.id ?? null,
      generatedByName: user?.fullName ?? null,
      reportKey,
      title: input.title,
    });
  } catch (err) {
    logger.error('Report content build failed', {
      assessmentId: input.assessmentId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  let pdf: Buffer;
  try {
    pdf = await renderReportPdf({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown PDF rendering error';
    await db.prepare(
      `INSERT INTO reports (id, report_key, type, title, customer_id, assessment_id, file_name, file_size, status, error_message, snapshot_json, generated_at, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, '', 0, 'failed', ?, NULL, ?, ?)`,
    ).run(
      reportId,
      reportKey,
      input.type,
      content.title,
      assessment.customerId,
      assessment.id,
      message.slice(0, 500),
      nowIso(),
      user?.id ?? null,
    );
    await recordAudit(db, {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: 'report.failed',
      entityType: 'report',
      entityId: reportId,
      summary: `Report ${reportKey} generation failed`,
    });
    throw new ValidationError(`Report generation failed: ${message}`);
  }

  const dir = path.resolve(process.cwd(), env.REPORTS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${reportKey}.pdf`;
  const filePath = resolveReportPath(env, fileName);
  fs.writeFileSync(filePath, pdf);

  await db.prepare(
    `INSERT INTO reports (id, report_key, type, title, customer_id, assessment_id, file_name, file_size, status, error_message, snapshot_json, generated_at, generated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', NULL, ?, ?, ?)`,
  ).run(
    reportId,
    reportKey,
    input.type,
    content.title,
    assessment.customerId,
    assessment.id,
    fileName,
    pdf.length,
    JSON.stringify(content),
    nowIso(),
    user?.id ?? null,
  );

  await recordAudit(db, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: 'report.generated',
    entityType: 'report',
    entityId: reportId,
    summary: `Generated ${input.type} report ${reportKey} for ${content.customer.name} (${assessment.assessmentKey})`,
  });

  const report = await getReport(db, reportId);
  if (!report) throw new NotFoundError('Report record not found after generation');
  return { report, content };
}

export function reportSnapshot(content: string | null): ReportContent | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as ReportContent;
  } catch {
    return null;
  }
}
