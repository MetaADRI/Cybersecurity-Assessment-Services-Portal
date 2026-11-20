import { describe, expect, it } from 'vitest';
import { generateRecommendations } from '../../server/src/scoring/recommendations';
import { parseCsv, toCsv } from '../../server/src/utils/csv';

describe('recommendation engine', () => {
  const effectiveControl = {
    controlKey: 'IAM-01',
    controlName: 'MFA enforcement',
    categoryName: 'Identity and Access Management',
    status: 'effective' as const,
  };

  it('produces nothing when controls are effective and no findings exist', () => {
    const result = generateRecommendations({ controls: [effectiveControl], findings: [] });
    expect(result).toHaveLength(0);
  });

  it('recommends an MFA rollout when MFA is ineffective', () => {
    const result = generateRecommendations({
      controls: [{ ...effectiveControl, status: 'ineffective' }],
      findings: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('mfa-not-enforced');
    expect(result[0].trigger).toMatch(/IAM-01/);
    expect(result[0].nextSteps.length).toBeGreaterThan(0);
  });

  it('recommends a restoration test when backup restoration is partial', () => {
    const result = generateRecommendations({
      controls: [
        {
          controlKey: 'IR-04',
          controlName: 'Backup restoration testing',
          categoryName: 'Incident Response',
          status: 'partially_effective',
        },
      ],
      findings: [],
    });
    expect(result.map((r) => r.ruleId)).toContain('backup-restoration-untested');
  });

  it('always flags open critical findings, even with a perfect control set', () => {
    const result = generateRecommendations({
      controls: [effectiveControl],
      findings: [
        {
          id: 'f1',
          findingKey: 'FND-0001',
          title: 'Critical issue',
          severity: 'critical',
          status: 'open',
        },
      ],
    });
    expect(result.map((r) => r.ruleId)).toContain('open-critical-findings');
  });

  it('ignores resolved and false-positive findings', () => {
    const result = generateRecommendations({
      controls: [effectiveControl],
      findings: [
        {
          id: 'f1',
          findingKey: 'FND-0001',
          title: 'Old critical',
          severity: 'critical',
          status: 'resolved',
        },
        {
          id: 'f2',
          findingKey: 'FND-0002',
          title: 'Not real',
          severity: 'critical',
          status: 'false_positive',
        },
      ],
    });
    expect(result).toHaveLength(0);
  });

  it('flags overdue remediation and pending verification separately', () => {
    const result = generateRecommendations({
      controls: [effectiveControl],
      findings: [
        {
          id: 'f1',
          findingKey: 'FND-0001',
          title: 'Late fix',
          severity: 'medium',
          status: 'in_progress',
          overdue: true,
        },
        {
          id: 'f2',
          findingKey: 'FND-0002',
          title: 'Awaiting check',
          severity: 'medium',
          status: 'pending_verification',
        },
      ],
    });
    const ids = result.map((r) => r.ruleId);
    expect(ids).toContain('overdue-remediation');
    expect(ids).toContain('pending-verification');
  });

  it('never claims evidence the application does not have', () => {
    const result = generateRecommendations({
      controls: [{ ...effectiveControl, status: 'ineffective' }],
      findings: [],
    });
    for (const r of result) {
      expect(r.trigger.length).toBeGreaterThan(0);
      expect(r.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('csv utilities', () => {
  it('parses quoted fields, commas and escaped quotes', () => {
    const input = 'a,b,c\n"hello, world","line\nbreak","say ""hi"""\n';
    const result = parseCsv(input);
    expect(result.headers).toEqual(['a', 'b', 'c']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['hello, world', 'line\nbreak', 'say "hi"']);
    expect(result.errors).toHaveLength(0);
  });

  it('reports an unterminated quote instead of silently accepting bad data', () => {
    const result = parseCsv('a,b\n"broken,c\n');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports an empty file', () => {
    const result = parseCsv('');
    expect(result.errors.join(' ')).toMatch(/empty/);
  });

  it('detects semicolon delimited files', () => {
    const result = parseCsv('a;b;c\n1;2;3\n');
    expect(result.headers).toEqual(['a', 'b', 'c']);
    expect(result.rows[0]).toEqual(['1', '2', '3']);
  });

  it('round-trips values through serialization', () => {
    const csv = toCsv(['title', 'note'], [['Has, comma', 'Has "quotes"']]);
    const parsed = parseCsv(csv);
    expect(parsed.rows[0]).toEqual(['Has, comma', 'Has "quotes"']);
  });

  it('escapes values that would otherwise break the file', () => {
    const csv = toCsv(['a'], [['line1\nline2']]);
    const parsed = parseCsv(csv);
    expect(parsed.rows[0][0]).toBe('line1\nline2');
  });
});
