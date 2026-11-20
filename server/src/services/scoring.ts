import type { Db } from '../database/db';
import {
  getAssessment,
  listControlAssessments,
  mapAssessment,
  updateAssessment,
  type AssessmentRow,
} from '../repositories/assessments';
import { listCategories, getScoringSettings } from '../repositories/settings';
import { findingCounts } from '../repositories/findings';
import { recordAudit } from '../repositories/audit';
import { computeScore } from '../scoring/engine';
import type { ScoreInput } from '../scoring/engine';
import type { ScoreResult } from '../../../shared/types';
import type { Assessment } from '../../../shared/types';
import { ConflictError, NotFoundError } from '../utils/errors';
import { nowIso } from '../utils/time';
import type { User } from '../../../shared/types';

export interface AssessmentSnapshot {
  snapshotVersion: 1;
  assessmentId: string;
  assessmentKey: string;
  customerId: string;
  customerName: string;
  title: string;
  scope: string;
  assessmentDate: string;
  assessor: string;
  completedAt: string;
  completedBy: string | null;
  score: ScoreResult;
  controls: {
    controlKey: string;
    name: string;
    categoryKey: string;
    status: string;
    score: number | null;
    justification: string | null;
    evidenceNotes: string | null;
    evidenceRef: string | null;
  }[];
  findings: { findingKey: string; title: string; severity: string; status: string }[];
}

/** Build the input for the pure scoring engine from persisted data. */
export async function buildScoreInput(db: Db, assessment: Assessment): Promise<ScoreInput> {
  const categories = await listCategories(db);
  const controls = await listControlAssessments(db, assessment.id);
  const settings = await getScoringSettings(db);
  const weights: Record<string, number> = {};
  for (const c of categories) weights[c.categoryKey] = c.weight;
  const counts = await findingCounts(db, assessment.customerId);

  return {
    categories: categories.map((c) => ({
      id: c.id,
      categoryKey: c.categoryKey,
      name: c.name,
      active: c.active,
    })),
    controls: controls.map((c) => ({
      controlId: c.controlId,
      controlKey: c.controlKey,
      categoryId: c.categoryId,
      categoryKey: c.categoryKey,
      weight: c.weight,
      status: c.status,
      score: c.score,
      justification: c.justification,
    })),
    weights,
    coverageThreshold: assessment.coverageThreshold,
    rubric: settings.rubric,
    methodologyVersion: assessment.methodologyVersion,
    criticalOpenFindings: counts.criticalOpen,
    highOpenFindings: counts.highOpen,
  };
}

/**
 * Completed assessments always return their frozen snapshot so that later
 * configuration changes cannot rewrite history. Draft and in-progress
 * assessments are computed live and reported as provisional until eligible.
 */
export async function computeAssessmentScore(
  db: Db,
  assessment: Assessment,
): Promise<ScoreResult> {
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    const raw = (await db
      .prepare('SELECT score_snapshot_json FROM assessments WHERE id = ?')
      .get(assessment.id)) as { score_snapshot_json: string | null } | undefined;
    if (raw?.score_snapshot_json) {
      try {
        const snapshot = JSON.parse(raw.score_snapshot_json) as AssessmentSnapshot;
        return snapshot.score;
      } catch {
        // fall through to a live computation if a snapshot is unreadable
      }
    }
  }
  const result = computeScore(await buildScoreInput(db, assessment));
  return result;
}

export async function getSnapshot(db: Db, assessmentId: string): Promise<AssessmentSnapshot | null> {
  const row = (await db
    .prepare('SELECT score_snapshot_json FROM assessments WHERE id = ?')
    .get(assessmentId)) as { score_snapshot_json: string | null } | undefined;
  if (!row?.score_snapshot_json) return null;
  try {
    return JSON.parse(row.score_snapshot_json) as AssessmentSnapshot;
  } catch {
    return null;
  }
}

/**
 * Complete an assessment: the score is frozen with the methodology that was in
 * force at completion. An assessment cannot be completed below the coverage
 * threshold - that would present missing data as a passing result.
 */
export async function completeAssessment(
  db: Db,
  assessmentId: string,
  user: User | null,
): Promise<{ assessment: Assessment; score: ScoreResult }> {
  const assessment = await getAssessment(db, assessmentId);
  if (!assessment) throw new NotFoundError('Assessment not found');
  if (assessment.status === 'completed' || assessment.status === 'archived') {
    throw new ConflictError(
      `Assessment ${assessment.assessmentKey} is already ${assessment.status}`,
    );
  }

  const score = computeScore(await buildScoreInput(db, assessment));
  if (!score.eligible) {
    throw new ConflictError(
      `Assessment cannot be completed yet: ${score.eligibilityReasons.join('; ')}`,
      { reasons: score.eligibilityReasons, coveragePct: score.coveragePct },
    );
  }

  const controls = await listControlAssessments(db, assessmentId);
  const findings = (await db
    .prepare('SELECT finding_key, title, severity, status FROM findings WHERE assessment_id = ?')
    .all(assessmentId)) as {
    finding_key: string;
    title: string;
    severity: string;
    status: string;
  }[];
  const customer = (await db
    .prepare('SELECT name FROM customers WHERE id = ?')
    .get(assessment.customerId)) as { name: string } | undefined;

  const previous = await findPreviousComparable(db, assessment);

  const snapshot: AssessmentSnapshot = {
    snapshotVersion: 1,
    assessmentId: assessment.id,
    assessmentKey: assessment.assessmentKey,
    customerId: assessment.customerId,
    customerName: customer?.name ?? '',
    title: assessment.title,
    scope: assessment.scope,
    assessmentDate: assessment.assessmentDate,
    assessor: assessment.assessor,
    completedAt: nowIso(),
    completedBy: user?.id ?? null,
    score,
    controls: controls.map((c) => ({
      controlKey: c.controlKey,
      name: c.controlName,
      categoryKey: c.categoryKey,
      status: c.status,
      score: c.score,
      justification: c.justification,
      evidenceNotes: c.evidenceNotes,
      evidenceRef: c.evidenceRef,
    })),
    findings: findings.map((f) => ({
      findingKey: f.finding_key,
      title: f.title,
      severity: f.severity,
      status: f.status,
    })),
  };

  const updated = await updateAssessment(db, assessmentId, {
    status: 'completed',
    overallScore: score.overallScore,
    coveragePct: score.coveragePct,
    provisional: false,
    scoreSnapshot: JSON.stringify(snapshot),
    completedAt: snapshot.completedAt,
    previousAssessmentId: previous?.id ?? assessment.previousAssessmentId ?? null,
  });

  await recordAudit(db, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: 'assessment.completed',
    entityType: 'assessment',
    entityId: assessmentId,
    summary: `Completed assessment ${assessment.assessmentKey} with score ${score.overallScore ?? 'n/a'} (${score.coveragePct}% coverage)`,
  });

  return { assessment: updated, score };
}

/** Most recent completed assessment for the same customer with a comparable scope. */
export async function findPreviousComparable(db: Db, assessment: Assessment): Promise<Assessment | null> {
  const rows = await db
    .prepare(
      `SELECT a.*, c.name AS customer_name FROM assessments a JOIN customers c ON c.id = a.customer_id
       WHERE a.customer_id = ? AND a.status = 'completed' AND a.id <> ? AND lower(a.scope) = lower(?)
       ORDER BY a.assessment_date DESC, a.completed_at DESC LIMIT 1`,
    )
    .all<AssessmentRow>(assessment.customerId, assessment.id, assessment.scope);
  if (rows.length === 0) return null;
  return mapAssessment(rows[0]);
}
