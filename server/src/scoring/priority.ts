/**
 * Deterministic remediation priority calculation.
 *
 * Severity alone does not decide remediation order. The suggested priority is
 * calculated from documented factors, and an analyst may override it with a
 * recorded justification. Factors that are unknown contribute zero - the model
 * never invents exploitability or exposure.
 */
import type {
  BusinessImpact,
  Exploitability,
  Exposure,
  Priority,
  Severity,
} from '../../../shared/constants';

export interface PriorityFactors {
  severity: Severity;
  exploitability: Exploitability;
  exposure: Exposure;
  businessImpact: BusinessImpact;
  compensatingControls?: string | null;
}

const SEVERITY_SCORE: Record<Severity, number> = {
  critical: 40,
  high: 30,
  medium: 20,
  low: 10,
  informational: 0,
};

const EXPLOITABILITY_SCORE: Record<Exploitability, number> = {
  weaponized: 25,
  poc: 15,
  public: 10,
  unknown: 0,
  not_exploitable: -10,
};

const EXPOSURE_SCORE: Record<Exposure, number> = {
  internet: 25,
  internal: 10,
  restricted: 5,
  unknown: 0,
};

const IMPACT_SCORE: Record<BusinessImpact, number> = {
  high: 20,
  medium: 10,
  low: 5,
  unknown: 0,
};

const COMPENSATING_REDUCTION = 10;

export function priorityScore(factors: PriorityFactors): number {
  let score = SEVERITY_SCORE[factors.severity];
  score += EXPLOITABILITY_SCORE[factors.exploitability];
  score += EXPOSURE_SCORE[factors.exposure];
  score += IMPACT_SCORE[factors.businessImpact];
  if (factors.compensatingControls && factors.compensatingControls.trim().length > 0) {
    score -= COMPENSATING_REDUCTION;
  }
  return Math.max(0, score);
}

export function priorityFromScore(score: number): Priority {
  if (score >= 70) return 'P1';
  if (score >= 50) return 'P2';
  if (score >= 30) return 'P3';
  return 'P4';
}

export function calculatePriority(factors: PriorityFactors): { score: number; priority: Priority } {
  const score = priorityScore(factors);
  return { score, priority: priorityFromScore(score) };
}

export function priorityFactorsFrom(
  input: Partial<PriorityFactors> & { severity: Severity },
): PriorityFactors {
  return {
    severity: input.severity,
    exploitability: input.exploitability ?? 'unknown',
    exposure: input.exposure ?? 'unknown',
    businessImpact: input.businessImpact ?? 'unknown',
    compensatingControls: input.compensatingControls ?? null,
  };
}
