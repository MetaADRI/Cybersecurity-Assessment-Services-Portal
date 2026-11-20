import { describe, expect, it } from 'vitest';
import {
  computeScore,
  compareScores,
  validateWeights,
  ScoreConfigError,
  round1,
  scoreFromStatus,
  isAssessed,
  DEFAULT_RUBRIC,
} from '../../server/src/scoring/engine';
import type { EngineCategory, EngineControl, ScoreInput } from '../../server/src/scoring/engine';
import type { ControlStatus } from '../../shared/constants';

const categories: EngineCategory[] = [
  {
    id: 'c1',
    categoryKey: 'vulnerability_management',
    name: 'Vulnerability Management',
    active: true,
  },
  {
    id: 'c2',
    categoryKey: 'identity_access',
    name: 'Identity and Access Management',
    active: true,
  },
  { id: 'c3', categoryKey: 'endpoint_security', name: 'Endpoint Security', active: true },
];

const defaultWeights = {
  vulnerability_management: 25,
  identity_access: 20,
  endpoint_security: 20,
  cloud_network: 15,
  security_awareness: 10,
  incident_response: 10,
};

function control(
  id: string,
  categoryId: string,
  status: ControlStatus,
  weight = 1,
  score?: number | null,
): EngineControl {
  return {
    controlId: id,
    controlKey: id.toUpperCase(),
    categoryId,
    categoryKey:
      categoryId === 'c1'
        ? 'vulnerability_management'
        : categoryId === 'c2'
          ? 'identity_access'
          : 'endpoint_security',
    weight,
    status,
    score: score === undefined ? scoreFromStatus(status, DEFAULT_RUBRIC) : score,
  };
}

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    categories,
    controls: [],
    weights: defaultWeights,
    coverageThreshold: 80,
    rubric: DEFAULT_RUBRIC,
    methodologyVersion: 1,
    ...overrides,
  };
}

describe('weight validation', () => {
  it('accepts weights totalling 100', () => {
    expect(() => validateWeights({ a: 60, b: 40 })).not.toThrow();
  });

  it('rejects weights that do not total 100', () => {
    expect(() => validateWeights({ a: 60, b: 30 })).toThrow(ScoreConfigError);
  });

  it('rejects negative or fractional weights', () => {
    expect(() => validateWeights({ a: 100, b: -1 })).toThrow(ScoreConfigError);
    expect(() => validateWeights({ a: 50.5, b: 49.5 })).toThrow(ScoreConfigError);
  });

  it('rejects an empty weight set', () => {
    expect(() => validateWeights({})).toThrow(ScoreConfigError);
  });
});

describe('control scoring', () => {
  it('maps statuses to rubric values', () => {
    expect(scoreFromStatus('effective', DEFAULT_RUBRIC)).toBe(100);
    expect(scoreFromStatus('partially_effective', DEFAULT_RUBRIC)).toBe(50);
    expect(scoreFromStatus('ineffective', DEFAULT_RUBRIC)).toBe(0);
    expect(scoreFromStatus('not_assessed', DEFAULT_RUBRIC)).toBeNull();
    expect(scoreFromStatus('not_applicable', DEFAULT_RUBRIC)).toBeNull();
  });

  it('treats only scored statuses as assessed', () => {
    expect(isAssessed('effective')).toBe(true);
    expect(isAssessed('not_assessed')).toBe(false);
    expect(isAssessed('not_applicable')).toBe(false);
  });
});

describe('category and overall scoring', () => {
  it('gives 100 when every applicable control is effective', () => {
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective'), control('vm2', 'c1', 'effective')],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    expect(result.categories[0].score).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.eligible).toBe(true);
  });

  it('gives 0 when every applicable control is ineffective', () => {
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'ineffective'), control('vm2', 'c1', 'ineffective')],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    expect(result.categories[0].score).toBe(0);
    expect(result.overallScore).toBe(0);
    expect(result.eligible).toBe(true);
  });

  it('computes a weighted mean across mixed results', () => {
    // (100*1 + 0*1) / 2 = 50
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective'), control('vm2', 'c1', 'ineffective')],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    expect(result.categories[0].score).toBe(50);
  });

  it('honours unequal control weights', () => {
    // (100*3 + 0*1) / 4 = 75
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective', 3), control('vm2', 'c1', 'ineffective', 1)],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    expect(result.categories[0].score).toBe(75);
  });

  it('does not award credit for missing assessments', () => {
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective'), control('vm2', 'c1', 'not_assessed')],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    // Only the assessed control counts: the score is 100, but coverage is 50% so the score is provisional.
    expect(result.categories[0].score).toBe(100);
    expect(result.coveragePct).toBe(50);
    expect(result.eligible).toBe(false);
    expect(result.provisional).toBe(true);
    expect(result.unassessedControls).toBe(1);
  });

  it('reports an entirely unassessed category as unknown, not 0 or 100', () => {
    const result = computeScore(
      input({
        controls: [control('iam1', 'c2', 'effective'), control('ep1', 'c3', 'not_assessed')],
        weights: defaultWeights,
      }),
    );
    const endpoint = result.categories.find((c) => c.categoryKey === 'endpoint_security')!;
    const identity = result.categories.find((c) => c.categoryKey === 'identity_access')!;
    expect(endpoint.score).toBeNull();
    expect(endpoint.eligible).toBe(false);
    expect(result.excludedCategories).toContain('Endpoint Security');
    // The unknown category must not drag the overall score to 0 or inflate it to 100.
    expect(identity.score).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.eligible).toBe(false);
    expect(result.eligibilityReasons.join(' ')).toMatch(
      /"Endpoint Security" has no assessed applicable controls/,
    );
  });

  it('excludes not-applicable controls from the denominator', () => {
    const result = computeScore(
      input({
        controls: [
          control('vm1', 'c1', 'effective'),
          control('vm2', 'c1', 'ineffective'),
          control('vm3', 'c1', 'not_applicable'),
        ],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    expect(result.categories[0].score).toBe(50);
    expect(result.categories[0].notApplicableControls).toBe(1);
    expect(result.applicableControls).toBe(2);
    expect(result.coveragePct).toBe(100);
  });

  it('treats an empty category set as unknown and ineligible', () => {
    const result = computeScore(input());
    expect(result.overallScore).toBeNull();
    expect(result.eligible).toBe(false);
    expect(result.coveragePct).toBe(0);
    expect(result.eligibilityReasons).toContain(
      'No assessable controls are available for this assessment',
    );
  });

  it('excludes a zero-weight category from the overall score', () => {
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'ineffective'), control('iam1', 'c2', 'effective')],
        weights: { vulnerability_management: 0, identity_access: 100 },
        categories: [categories[0], categories[1]],
      }),
    );
    expect(result.overallScore).toBe(100);
    expect(result.eligible).toBe(false);
    expect(result.eligibilityReasons.join(' ')).toMatch(/weight of 0/);
  });

  it('normalises the overall score over eligible category weights only', () => {
    // Category 1: 100 (weight 25). Category 2: unknown (weight 75) -> overall 100 from weight 25.
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective')],
        weights: { vulnerability_management: 25, identity_access: 75 },
        categories: [categories[0], categories[1]],
      }),
    );
    expect(result.overallScore).toBe(100);
    expect(result.eligible).toBe(false); // category 2 has no assessed controls
  });

  it('marks a score provisional below the coverage threshold', () => {
    const controls = Array.from({ length: 10 }, (_, i) =>
      control(`vm${i}`, 'c1', i < 6 ? 'effective' : 'not_assessed'),
    );
    const result = computeScore(
      input({
        controls,
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
        coverageThreshold: 80,
      }),
    );
    expect(result.coveragePct).toBe(60);
    expect(result.eligible).toBe(false);
    expect(result.eligibilityReasons.join(' ')).toMatch(/below the configured threshold/);
  });

  it('rounds scores to one decimal place', () => {
    // (100*1 + 100*1 + 50*1)/3 = 83.333...
    const result = computeScore(
      input({
        controls: [
          control('vm1', 'c1', 'effective'),
          control('vm2', 'c1', 'effective'),
          control('vm3', 'c1', 'partially_effective'),
        ],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    expect(result.categories[0].score).toBe(83.3);
    expect(round1(83.3333333)).toBe(83.3);
  });

  it('is deterministic for the same inputs', () => {
    const args = input({
      controls: [control('vm1', 'c1', 'partially_effective'), control('iam1', 'c2', 'effective')],
    });
    const a = computeScore(args);
    const b = computeScore(args);
    expect(a.overallScore).toBe(b.overallScore);
    expect(a.coveragePct).toBe(b.coveragePct);
    expect(a.categories).toEqual(b.categories);
  });

  it('keeps critical findings visible regardless of a high score', () => {
    const result = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective')],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
        criticalOpenFindings: 3,
        highOpenFindings: 2,
      }),
    );
    expect(result.overallScore).toBe(100);
    expect(result.criticalOpenFindings).toBe(3);
    expect(result.highOpenFindings).toBe(2);
  });
});

describe('score comparison', () => {
  const base = computeScore(
    input({
      controls: [control('vm1', 'c1', 'effective'), control('iam1', 'c2', 'effective')],
      categories: [categories[0], categories[1]],
      weights: defaultWeights,
      coverageThreshold: 80,
    }),
  );

  it('reports change and coverage movement for comparable assessments', () => {
    const scope = { categories: [categories[0], categories[1]], weights: defaultWeights };
    const from = computeScore(
      input({
        ...scope,
        controls: [control('vm1', 'c1', 'effective'), control('iam1', 'c2', 'effective')],
      }),
    );
    const improved = computeScore(
      input({
        ...scope,
        controls: [control('vm1', 'c1', 'effective'), control('iam1', 'c2', 'partially_effective')],
      }),
    );
    const comparison = compareScores(from, improved, {
      previousScope: 'Scope A',
      currentScope: 'Scope A',
    });
    expect(comparison.scoreChange).toBeLessThan(0);
    expect(comparison.comparable).toBe(true);
  });

  it('discloses a scope difference', () => {
    const comparison = compareScores(base, base, {
      previousScope: 'Scope A',
      currentScope: 'Scope B',
    });
    expect(comparison.scopeChanged).toBe(true);
    expect(comparison.comparable).toBe(false);
    expect(comparison.caveats.join(' ')).toMatch(/scope differs/);
  });

  it('discloses a large coverage difference', () => {
    const thin = computeScore(
      input({
        controls: [
          control('vm1', 'c1', 'effective'),
          control('vm2', 'c1', 'not_assessed'),
          control('iam1', 'c2', 'not_assessed'),
        ],
        weights: defaultWeights,
        coverageThreshold: 80,
      }),
    );
    const comparison = compareScores(thin, base, { previousScope: 'A', currentScope: 'A' });
    expect(comparison.caveats.join(' ')).toMatch(/Coverage changed/);
  });

  it('warns when a higher score is driven by more excluded categories', () => {
    const fewer = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective')],
        weights: defaultWeights,
      }),
    );
    const more = computeScore(
      input({
        controls: [control('vm1', 'c1', 'effective')],
        weights: { vulnerability_management: 100 },
        categories: [categories[0]],
      }),
    );
    const comparison = compareScores(more, fewer, { previousScope: 'A', currentScope: 'A' });
    expect(comparison.scoreChange).toBe(0);
    expect(comparison.caveats.length).toBeGreaterThanOrEqual(1);
  });

  it('flags methodology changes', () => {
    const v2 = computeScore(input({ methodologyVersion: 2 }));
    const comparison = compareScores(base, v2, { previousScope: 'A', currentScope: 'A' });
    expect(comparison.methodologyChanged).toBe(true);
    expect(comparison.caveats.join(' ')).toMatch(/methodology changed/);
  });
});
