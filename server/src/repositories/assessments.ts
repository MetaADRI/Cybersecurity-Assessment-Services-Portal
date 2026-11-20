import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import { nextSequence } from '../database/db';
import type { Assessment, ControlAssessment } from '../../../shared/types';
import type { AssessmentStatus, ControlStatus, AssessmentType } from '../../../shared/constants';
import { ConflictError, NotFoundError } from '../utils/errors';
import { scoreFromStatus, DEFAULT_RUBRIC } from '../scoring/engine';

export interface AssessmentRow {
  id: string;
  assessment_key: string;
  customer_id: string;
  title: string;
  type: AssessmentType;
  scope: string;
  description: string | null;
  assessment_date: string;
  assessor: string;
  status: AssessmentStatus;
  methodology_version: number;
  coverage_threshold: number;
  coverage_pct: number;
  provisional: number;
  overall_score: number | null;
  previous_assessment_id: string | null;
  score_snapshot_json: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string | null;
  customer_name?: string;
}

export function mapAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    assessmentKey: row.assessment_key,
    customerId: row.customer_id,
    customerName: row.customer_name,
    title: row.title,
    type: row.type,
    scope: row.scope,
    description: row.description,
    assessmentDate: row.assessment_date,
    assessor: row.assessor,
    status: row.status,
    methodologyVersion: row.methodology_version,
    coverageThreshold: row.coverage_threshold,
    coveragePct: row.coverage_pct,
    provisional: row.provisional === 1,
    overallScore: row.overall_score,
    previousAssessmentId: row.previous_assessment_id,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
  };
}

export interface ListAssessmentsOptions {
  page: number;
  pageSize: number;
  customerId?: string;
  status?: AssessmentStatus;
  q?: string;
  dir: 'asc' | 'desc';
}

export async function listAssessments(
  db: Db,
  opts: ListAssessmentsOptions,
): Promise<{ items: Assessment[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.customerId) {
    where.push('a.customer_id = ?');
    params.push(opts.customerId);
  }
  if (opts.status) {
    where.push('a.status = ?');
    params.push(opts.status);
  }
  if (opts.q) {
    where.push('(lower(a.title) LIKE ? OR lower(a.assessment_key) LIKE ?)');
    const like = `%${opts.q.toLowerCase()}%`;
    params.push(like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(
    (await db
      .prepare(`SELECT COUNT(*) AS c FROM assessments a ${clause}`)
      .get<{ c: number | string }>(...params))!.c,
  );
  const rows = await db
    .prepare(
      `SELECT a.*, c.name AS customer_name FROM assessments a
       JOIN customers c ON c.id = a.customer_id
       ${clause} ORDER BY a.assessment_date ${opts.dir === 'asc' ? 'ASC' : 'DESC'}, a.created_at ${opts.dir === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
    )
    .all<AssessmentRow>(...params, opts.pageSize, (opts.page - 1) * opts.pageSize);
  return { items: rows.map(mapAssessment), total };
}

export async function getAssessment(db: Db, id: string): Promise<Assessment | null> {
  const row = await db
    .prepare(
      `SELECT a.*, c.name AS customer_name FROM assessments a JOIN customers c ON c.id = a.customer_id WHERE a.id = ?`,
    )
    .get<AssessmentRow>(id);
  return row ? mapAssessment(row) : null;
}

export async function requireAssessment(db: Db, id: string): Promise<Assessment> {
  const assessment = await getAssessment(db, id);
  if (!assessment) throw new NotFoundError('Assessment not found');
  return assessment;
}

export async function getSnapshot(db: Db, id: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT score_snapshot_json FROM assessments WHERE id = ?')
    .get<{ score_snapshot_json: string | null }>(id);
  return row?.score_snapshot_json ?? null;
}

export async function createAssessment(
  db: Db,
  input: {
    customerId: string;
    title: string;
    type: AssessmentType;
    scope: string;
    description?: string | null;
    assessmentDate: string;
    assessor: string;
    status: AssessmentStatus;
    methodologyVersion: number;
    coverageThreshold: number;
    createdBy: string | null;
    isDemo?: boolean;
    controlIds: string[];
  },
): Promise<Assessment> {
  const id = newId();
  const now = nowIso();
  const tx = db.transaction(async () => {
    const key = await nextSequence(db, 'assessment', 'ASM');
    await db
      .prepare(
        `INSERT INTO assessments (id, assessment_key, customer_id, title, type, scope, description, assessment_date, assessor, status,
          methodology_version, coverage_threshold, coverage_pct, provisional, overall_score, is_demo, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NULL, ?, ?, ?, ?)`,
      )
      .run(
        id,
        key,
        input.customerId,
        input.title,
        input.type,
        input.scope,
        input.description || null,
        input.assessmentDate,
        input.assessor,
        input.status,
        input.methodologyVersion,
        input.coverageThreshold,
        input.isDemo ? 1 : 0,
        now,
        now,
        input.createdBy,
      );
    const insertControl = db.prepare(
      `INSERT INTO control_assessments (id, assessment_id, control_id, status, score, created_at, updated_at)
       VALUES (?, ?, ?, 'not_assessed', NULL, ?, ?)`,
    );
    for (const controlId of input.controlIds) {
      await insertControl.run(newId(), id, controlId, now, now);
    }
  });
  await tx();
  return (await getAssessment(db, id))!;
}

export async function updateAssessment(
  db: Db,
  id: string,
  patch: Partial<{
    title: string;
    type: AssessmentType;
    scope: string;
    description: string | null;
    assessmentDate: string;
    assessor: string;
    status: AssessmentStatus;
    coverageThreshold: number;
    overallScore: number | null;
    coveragePct: number;
    provisional: boolean;
    scoreSnapshot: string | null;
    completedAt: string | null;
    previousAssessmentId: string | null;
  }>,
): Promise<Assessment> {
  const columns: Record<string, string> = {
    title: 'title',
    type: 'type',
    scope: 'scope',
    description: 'description',
    assessmentDate: 'assessment_date',
    assessor: 'assessor',
    status: 'status',
    coverageThreshold: 'coverage_threshold',
    overallScore: 'overall_score',
    coveragePct: 'coverage_pct',
    provisional: 'provisional',
    scoreSnapshot: 'score_snapshot_json',
    completedAt: 'completed_at',
    previousAssessmentId: 'previous_assessment_id',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value === '' ? null : value);
    }
  }
  if (sets.length === 0) return await requireAssessment(db, id);
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.prepare(`UPDATE assessments SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return await requireAssessment(db, id);
}

export interface ControlAssessmentRow extends ControlAssessment {
  controlKey: string;
  controlName: string;
  categoryId: string;
  categoryKey: string;
  categoryName: string;
  weight: number;
  guidance: string;
  rubric: string;
  applicability: string;
  evidenceRequirements: string;
  description: string;
  active: boolean;
  assessedByName: string | null;
}

export async function listControlAssessments(
  db: Db,
  assessmentId: string,
): Promise<ControlAssessmentRow[]> {
  const rows = await db
    .prepare(
      `SELECT ca.*, sc.control_key, sc.name AS control_name, sc.description, sc.category_id, sc.guidance, sc.rubric,
              sc.applicability, sc.evidence_requirements, sc.weight, sc.active,
              cat.category_key, cat.name AS category_name,
              u.full_name AS assessed_by_name
       FROM control_assessments ca
       JOIN security_controls sc ON sc.id = ca.control_id
       JOIN security_categories cat ON cat.id = sc.category_id
       LEFT JOIN users u ON u.id = ca.assessed_by
       WHERE ca.assessment_id = ?
       ORDER BY cat.sort_order ASC, sc.control_key ASC`,
    )
    .all<Record<string, unknown>>(assessmentId);
  return rows.map((r) => ({
    id: r.id as string,
    assessmentId: r.assessment_id as string,
    controlId: r.control_id as string,
    status: r.status as ControlStatus,
    score: (r.score as number | null) ?? null,
    justification: (r.justification as string | null) ?? null,
    evidenceNotes: (r.evidence_notes as string | null) ?? null,
    evidenceRef: (r.evidence_ref as string | null) ?? null,
    assessedAt: (r.assessed_at as string | null) ?? null,
    assessedBy: (r.assessed_by as string | null) ?? null,
    assessedByName: (r.assessed_by_name as string | null) ?? null,
    controlKey: r.control_key as string,
    controlName: r.control_name as string,
    description: r.description as string,
    categoryId: r.category_id as string,
    categoryKey: r.category_key as string,
    categoryName: r.category_name as string,
    weight: r.weight as number,
    guidance: r.guidance as string,
    rubric: r.rubric as string,
    applicability: r.applicability as string,
    evidenceRequirements: r.evidence_requirements as string,
    active: (r.active as number) === 1,
  }));
}

/**
 * Update a single control result. `not_applicable` requires a justification and
 * `not_assessed` can never carry a score, so the stored score always matches
 * the rubric rather than a value supplied by the client.
 */
export async function upsertControlAssessment(
  db: Db,
  input: {
    assessmentId: string;
    controlId: string;
    status: ControlStatus;
    justification?: string | null;
    evidenceNotes?: string | null;
    evidenceRef?: string | null;
    userId: string | null;
    rubric: { effective: number; partially_effective: number; ineffective: number };
  },
): Promise<ControlAssessmentRow> {
  const existing = await db
    .prepare('SELECT id FROM control_assessments WHERE assessment_id = ? AND control_id = ?')
    .get<{ id: string }>(input.assessmentId, input.controlId);
  if (!existing) throw new NotFoundError('Control is not part of this assessment');

  const score = scoreFromStatus(input.status, input.rubric ?? DEFAULT_RUBRIC);
  const now = nowIso();
  await db
    .prepare(
      `UPDATE control_assessments
       SET status = ?, score = ?, justification = ?, evidence_notes = ?, evidence_ref = ?, assessed_at = ?, assessed_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      score,
      input.justification || null,
      input.evidenceNotes || null,
      input.evidenceRef || null,
      input.status === 'not_assessed' ? null : now,
      input.status === 'not_assessed' ? null : input.userId,
      now,
      existing.id,
    );
  const updated = (await listControlAssessments(db, input.assessmentId)).find(
    (c) => c.controlId === input.controlId,
  );
  if (!updated) throw new NotFoundError('Control assessment not found after update');
  return updated;
}

export function assertAssessmentNotCompleted(assessment: Assessment): void {
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw new ConflictError(
      `Assessment ${assessment.assessmentKey} is ${assessment.status}; its recorded results are frozen and cannot be edited.`,
    );
  }
}
