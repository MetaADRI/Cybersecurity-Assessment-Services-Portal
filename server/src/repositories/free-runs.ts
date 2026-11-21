import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import type { FreeResult } from '../../../shared/free-services';
import type { FreeRunSummary } from '../../../shared/client-types';

interface FreeRunRow {
  id: string;
  visitor_id: string;
  service_key: FreeResult['serviceKey'];
  target: string | null;
  consent_confirmed: number;
  status: 'running' | 'completed' | 'failed';
  score: number | null;
  results_json: string | null;
  created_at: string;
  report_id?: string | null;
}

export function mapFreeRun(row: FreeRunRow): FreeRunSummary {
  let result: FreeResult | null = null;
  if (row.results_json) {
    try {
      result = JSON.parse(row.results_json) as FreeResult;
    } catch {
      result = null;
    }
  }
  return {
    id: row.id,
    serviceKey: row.service_key,
    target: row.target,
    status: row.status,
    score: row.score,
    result,
    createdAt: row.created_at,
    hasReport: Boolean(row.report_id),
  };
}

export async function createFreeRun(
  db: Db,
  input: {
    visitorId: string;
    serviceKey: string;
    target?: string | null;
    consentConfirmed: boolean;
  },
): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO free_service_runs
         (id, visitor_id, service_key, target, consent_confirmed, status, score, results_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'running', NULL, NULL, ?)`,
    )
    .run(
      id,
      input.visitorId,
      input.serviceKey,
      input.target ?? null,
      input.consentConfirmed ? 1 : 0,
      nowIso(),
    );
  return id;
}

export async function completeFreeRun(
  db: Db,
  id: string,
  result: FreeResult,
  status: 'completed' | 'failed' = 'completed',
): Promise<void> {
  await db
    .prepare(
      `UPDATE free_service_runs
       SET status = ?, score = ?, results_json = ?
       WHERE id = ?`,
    )
    .run(status, result.score, JSON.stringify(result), id);
}

export async function failFreeRun(db: Db, id: string): Promise<void> {
  await db.prepare(`UPDATE free_service_runs SET status = 'failed' WHERE id = ?`).run(id);
}

export async function getFreeRunForVisitor(
  db: Db,
  id: string,
  visitorId: string,
): Promise<FreeRunSummary | null> {
  const row = await db
    .prepare(
      `SELECT r.*, cr.id AS report_id
       FROM free_service_runs r
       LEFT JOIN client_reports cr ON cr.free_service_run_id = r.id
       WHERE r.id = ? AND r.visitor_id = ?`,
    )
    .get<FreeRunRow>(id, visitorId);
  return row ? mapFreeRun(row) : null;
}

export async function getFreeRunForClient(
  db: Db,
  id: string,
  clientId: string,
): Promise<FreeRunSummary | null> {
  const row = await db
    .prepare(
      `SELECT r.*, cr.id AS report_id
       FROM free_service_runs r
       JOIN visitors v ON v.id = r.visitor_id
       LEFT JOIN client_reports cr ON cr.free_service_run_id = r.id
       WHERE r.id = ? AND v.client_id = ?`,
    )
    .get<FreeRunRow>(id, clientId);
  return row ? mapFreeRun(row) : null;
}

export async function listFreeRunsForClient(
  db: Db,
  clientId: string,
  limit = 20,
): Promise<FreeRunSummary[]> {
  const rows = await db
    .prepare(
      `SELECT r.*, cr.id AS report_id
       FROM free_service_runs r
       JOIN visitors v ON v.id = r.visitor_id
       LEFT JOIN client_reports cr ON cr.free_service_run_id = r.id
       WHERE v.client_id = ?
       ORDER BY r.created_at DESC
       LIMIT ?`,
    )
    .all<FreeRunRow>(clientId, limit);
  return rows.map(mapFreeRun);
}

export async function latestRunForClient(db: Db, clientId: string): Promise<FreeRunSummary | null> {
  return (await listFreeRunsForClient(db, clientId, 1))[0] ?? null;
}
