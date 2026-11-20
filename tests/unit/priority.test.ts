import { describe, expect, it } from 'vitest';
import {
  calculatePriority,
  priorityFromScore,
  priorityScore,
  priorityFactorsFrom,
} from '../../server/src/scoring/priority';

describe('priority calculation', () => {
  it('scores a critical, weaponised, internet-facing, high-impact issue as P1', () => {
    const result = calculatePriority({
      severity: 'critical',
      exploitability: 'weaponized',
      exposure: 'internet',
      businessImpact: 'high',
    });
    // 40 + 25 + 25 + 20 = 110 -> P1
    expect(result.score).toBe(110);
    expect(result.priority).toBe('P1');
  });

  it('never invents risk factors that are unknown', () => {
    const unknown = priorityScore({
      severity: 'high',
      exploitability: 'unknown',
      exposure: 'unknown',
      businessImpact: 'unknown',
    });
    // severity only
    expect(unknown).toBe(30);
    expect(priorityFromScore(30)).toBe('P3');
  });

  it('reduces the score when compensating controls are documented', () => {
    const without = priorityScore({
      severity: 'high',
      exploitability: 'poc',
      exposure: 'internal',
      businessImpact: 'medium',
    });
    const withControls = priorityScore({
      severity: 'high',
      exploitability: 'poc',
      exposure: 'internal',
      businessImpact: 'medium',
      compensatingControls: 'Access restricted to a jump host with MFA.',
    });
    expect(withControls).toBe(without - 10);
  });

  it('maps score bands to P1..P4', () => {
    expect(priorityFromScore(100)).toBe('P1');
    expect(priorityFromScore(70)).toBe('P1');
    expect(priorityFromScore(69)).toBe('P2');
    expect(priorityFromScore(50)).toBe('P2');
    expect(priorityFromScore(49)).toBe('P3');
    expect(priorityFromScore(30)).toBe('P3');
    expect(priorityFromScore(29)).toBe('P4');
  });

  it('never returns a negative score', () => {
    expect(
      priorityScore({
        severity: 'informational',
        exploitability: 'not_exploitable',
        exposure: 'restricted',
        businessImpact: 'low',
      }),
    ).toBe(0);
  });

  it('builds factors with safe defaults', () => {
    const factors = priorityFactorsFrom({ severity: 'low' });
    expect(factors).toEqual({
      severity: 'low',
      exploitability: 'unknown',
      exposure: 'unknown',
      businessImpact: 'unknown',
      compensatingControls: null,
    });
  });
});
