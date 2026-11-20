/**
 * Deterministic scoring engine.
 *
 * This module is intentionally pure: it receives plain data and returns a
 * score result. It never touches the database, Express or React, so it can be
 * unit tested exhaustively.
 *
 * Methodology (version 1):
 *   Category score = sum(control weight x control score) / sum(weights of assessed, applicable controls)
 *   Overall score  = sum(category weight x category score) / sum(weights of eligible categories)
 *
 * Missing data never improves a score. A category with no assessed applicable
 * control is "unknown", not 0 and not 100, and is removed from the denominator
 * while remaining visible as excluded coverage.
 */
import type { ControlStatus } from '../../../shared/constants';
import type { CategoryScore, ScoreResult } from '../../../shared/types';

export interface Rubric {
  effective: number;
  partially_effective: number;
  ineffective: number;
}

export const DEFAULT_RUBRIC: Rubric = {
  effective: 100,
  partially_effective: 50,
  ineffective: 0,
};

export interface EngineCategory {
  id: string;
  categoryKey: string;
  name: string;
  active: boolean;
}

export interface EngineControl {
  controlId: string;
  controlKey: string;
  categoryId: string;
  categoryKey: string;
  weight: number;
  status: ControlStatus;
  score: number | null;
  justification?: string | null;
}

export interface ScoreInput {
  categories: EngineCategory[];
  controls: EngineControl[];
  /** categoryKey -> weight (0..100) */
  weights: Record<string, number>;
  coverageThreshold: number;
  rubric: Rubric;
  methodologyVersion: number;
  criticalOpenFindings?: number;
  highOpenFindings?: number;
}

export class ScoreConfigError extends Error {}

export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** Weights must be non-negative integers totalling 100 within tolerance. */
export function validateWeights(weights: Record<string, number>, tolerance = 0): void {
  const values = Object.values(weights);
  if (values.length === 0) throw new ScoreConfigError('At least one category weight is required');
  for (const w of values) {
    if (!Number.isInteger(w) || w < 0 || w > 100) {
      throw new ScoreConfigError(`Category weights must be whole numbers between 0 and 100`);
    }
  }
  const total = values.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > tolerance) {
    throw new ScoreConfigError(`Category weights must total 100 (currently ${total})`);
  }
}

const ASSESSED_STATUSES: ControlStatus[] = ['effective', 'partially_effective', 'ineffective'];

export function isAssessed(status: ControlStatus): boolean {
  return ASSESSED_STATUSES.includes(status);
}

export function scoreFromStatus(status: ControlStatus, rubric: Rubric): number | null {
  switch (status) {
    case 'effective':
      return rubric.effective;
    case 'partially_effective':
      return rubric.partially_effective;
    case 'ineffective':
      return rubric.ineffective;
    default:
      return null;
  }
}

export function computeScore(input: ScoreInput): ScoreResult {
  validateWeights(input.weights);

  const activeCategories = input.categories.filter((c) => c.active);
  const controlsByCategory = new Map<string, EngineControl[]>();
  for (const control of input.controls) {
    const list = controlsByCategory.get(control.categoryId) ?? [];
    list.push(control);
    controlsByCategory.set(control.categoryId, list);
  }

  const categories: CategoryScore[] = [];
  const excludedCategories: string[] = [];

  let applicableTotal = 0;
  let assessedTotal = 0;
  let unassessedTotal = 0;
  let naTotal = 0;
  let totalControls = 0;

  let weightedSum = 0;
  let eligibleWeight = 0;

  for (const category of activeCategories) {
    const controls = controlsByCategory.get(category.id) ?? [];
    const weight = input.weights[category.categoryKey] ?? 0;

    let applicable = 0;
    let assessed = 0;
    let na = 0;
    let sumWeighted = 0;
    let sumWeights = 0;

    for (const c of controls) {
      totalControls += 1;
      if (c.status === 'not_applicable') {
        na += 1;
        continue;
      }
      applicable += 1;
      if (isAssessed(c.status) && c.score !== null) {
        assessed += 1;
        sumWeighted += c.weight * c.score;
        sumWeights += c.weight;
      }
    }

    const score = sumWeights > 0 ? round1(sumWeighted / sumWeights) : null;
    const unassessed = applicable - assessed;

    applicableTotal += applicable;
    assessedTotal += assessed;
    unassessedTotal += unassessed;
    naTotal += na;

    const eligible = score !== null && weight > 0;
    if (eligible) {
      weightedSum += weight * (score as number);
      eligibleWeight += weight;
    } else {
      excludedCategories.push(category.name);
    }

    categories.push({
      categoryId: category.id,
      categoryKey: category.categoryKey,
      name: category.name,
      weight,
      score,
      applicableControls: applicable,
      assessedControls: assessed,
      unassessedControls: unassessed,
      notApplicableControls: na,
      eligible,
    });
  }

  const coveragePct = applicableTotal > 0 ? round1((assessedTotal / applicableTotal) * 100) : 0;
  const overallScore = eligibleWeight > 0 ? round1(weightedSum / eligibleWeight) : null;

  const eligibilityReasons: string[] = [];
  if (totalControls === 0) {
    eligibilityReasons.push('No assessable controls are available for this assessment');
  }
  if (coveragePct < input.coverageThreshold) {
    eligibilityReasons.push(
      `Coverage ${coveragePct}% is below the configured threshold of ${input.coverageThreshold}%`,
    );
  }
  for (const c of categories) {
    if (c.applicableControls === 0) {
      eligibilityReasons.push(`Category "${c.name}" contains no applicable controls`);
    } else if (c.score === null) {
      eligibilityReasons.push(`Category "${c.name}" has no assessed applicable controls`);
    } else if (c.weight === 0) {
      eligibilityReasons.push(`Category "${c.name}" has a weight of 0 and is excluded`);
    }
  }

  const eligible = eligibilityReasons.length === 0 && overallScore !== null;

  return {
    overallScore: eligible ? overallScore : overallScore === null ? null : round1(overallScore),
    provisional: !eligible,
    eligible,
    eligibilityReasons,
    coveragePct,
    applicableControls: applicableTotal,
    assessedControls: assessedTotal,
    unassessedControls: unassessedTotal,
    notApplicableControls: naTotal,
    totalControls,
    categories,
    excludedCategories,
    methodologyVersion: input.methodologyVersion,
    computedAt: new Date().toISOString(),
    criticalOpenFindings: input.criticalOpenFindings ?? 0,
    highOpenFindings: input.highOpenFindings ?? 0,
  };
}

export interface ScoreComparison {
  previousScore: number | null;
  currentScore: number | null;
  scoreChange: number | null;
  coverageChange: number | null;
  categoryChanges: {
    name: string;
    previous: number | null;
    current: number | null;
    change: number | null;
  }[];
  comparable: boolean;
  caveats: string[];
  methodologyChanged: boolean;
  scopeChanged: boolean;
}

export function compareScores(
  previous: ScoreResult,
  current: ScoreResult,
  context: {
    previousScope: string;
    currentScope: string;
    previousTitle?: string;
    currentTitle?: string;
  },
): ScoreComparison {
  const caveats: string[] = [];
  const methodologyChanged = previous.methodologyVersion !== current.methodologyVersion;
  const scopeChanged =
    context.previousScope.trim().toLowerCase() !== context.currentScope.trim().toLowerCase();

  if (methodologyChanged) {
    caveats.push(
      `The scoring methodology changed (v${previous.methodologyVersion} to v${current.methodologyVersion}); scores are not directly comparable.`,
    );
  }
  if (scopeChanged) {
    caveats.push('The assessment scope differs between the two assessments.');
  }
  const coverageDelta = round1(current.coveragePct - previous.coveragePct);
  if (Math.abs(coverageDelta) >= 10) {
    caveats.push(
      `Coverage changed by ${coverageDelta > 0 ? '+' : ''}${coverageDelta} percentage points; part of the score movement may reflect how much was assessed rather than a change in security posture.`,
    );
  }
  if (previous.provisional || current.provisional) {
    caveats.push('At least one of the two scores is provisional because coverage was incomplete.');
  }

  const prevByCat = new Map(previous.categories.map((c) => [c.categoryKey, c]));
  const categoryChanges = current.categories.map((c) => {
    const p = prevByCat.get(c.categoryKey);
    const prevScore = p ? p.score : null;
    const change = prevScore !== null && c.score !== null ? round1(c.score - prevScore) : null;
    return { name: c.name, previous: prevScore, current: c.score, change };
  });

  // A score increase driven only by newly excluded/unknown categories is not an improvement.
  const scoreChange =
    previous.overallScore !== null && current.overallScore !== null
      ? round1(current.overallScore - previous.overallScore)
      : null;
  if (
    scoreChange !== null &&
    scoreChange > 0 &&
    current.excludedCategories.length > previous.excludedCategories.length
  ) {
    caveats.push(
      'The score increased while more categories became unassessed; this should not be read as a security improvement.',
    );
  }

  return {
    previousScore: previous.overallScore,
    currentScore: current.overallScore,
    scoreChange,
    coverageChange: coverageDelta,
    categoryChanges,
    comparable: caveats.length === 0,
    caveats,
    methodologyChanged,
    scopeChanged,
  };
}
