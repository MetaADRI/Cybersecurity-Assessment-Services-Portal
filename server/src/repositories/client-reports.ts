import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import type { ClientReportSummary } from '../../../shared/client-types';
import type { FreeServiceKey } from '../../../shared/free-services';

interface ReportRow {
  id: string;
  client_id: string | null;
  visitor_id: string;
  free_service_run_id: string;
  pdf_path: string;
  created_at: string;
  service_key: FreeServiceKey;
  target: string | null;
  score: number | null;
}

function mapReport(row: ReportRow): ClientReportSummary {
  return {
    id: row.id,
    serviceKey: row.service_key,
    target: row.target,
    score: row.score,
    createdAt: row.created_at,
    downloadUrl: `/api/v1/client/reports/${row.id}/download`,
  };
}

export async function createClientReport(
  db: Db,
  input: {
    clientId: string | null;
    visitorId: string;
    freeServiceRunId: string;
    pdfPath: string;
  },
): Promise<{ id: string; fileName: string }> {
  const existing = await db
    .prepare('SELECT id, pdf_path FROM client_reports WHERE free_service_run_id = ?')
    .get<{ id: string; pdf_path: string }>(input.freeServiceRunId);
  if (existing) return { id: existing.id, fileName: existing.pdf_path };
  const id = newId();
  await db
    .prepare(
      `INSERT INTO client_reports (id, client_id, visitor_id, free_service_run_id, pdf_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.clientId, input.visitorId, input.freeServiceRunId, input.pdfPath, nowIso());
  return { id, fileName: input.pdfPath };
}

export async function getReportForVisitor(
  db: Db,
  input: { runId: string; visitorId: string },
): Promise<{ id: string; fileName: string } | null> {
  const row = await db
    .prepare(
      `SELECT cr.id, cr.pdf_path
       FROM client_reports cr
       JOIN free_service_runs r ON r.id = cr.free_service_run_id
       WHERE cr.free_service_run_id = ? AND r.visitor_id = ?`,
    )
    .get<{ id: string; pdf_path: string }>(input.runId, input.visitorId);
  return row ? { id: row.id, fileName: row.pdf_path } : null;
}

export async function listReportsForClient(db: Db, clientId: string): Promise<ClientReportSummary[]> {
  const rows = await db
    .prepare(
      `SELECT cr.*, r.service_key, r.target, r.score
       FROM client_reports cr
       JOIN free_service_runs r ON r.id = cr.free_service_run_id
       JOIN visitors v ON v.id = cr.visitor_id
       WHERE COALESCE(cr.client_id, v.client_id) = ?
       ORDER BY cr.created_at DESC`,
    )
    .all<ReportRow>(clientId);
  return rows.map(mapReport);
}

export async function getReportForClient(
  db: Db,
  clientId: string,
  reportId: string,
): Promise<{ id: string; fileName: string } | null> {
  const row = await db
    .prepare(
      `SELECT cr.id, cr.pdf_path
       FROM client_reports cr
       JOIN visitors v ON v.id = cr.visitor_id
       WHERE cr.id = ? AND COALESCE(cr.client_id, v.client_id) = ?`,
    )
    .get<{ id: string; pdf_path: string }>(reportId, clientId);
  return row ? { id: row.id, fileName: row.pdf_path } : null;
}
