import {
  FREE_RESULT_SCHEMA_VERSION,
  PHISHING_FINDING_COPY,
  PHISHING_SCENARIOS,
  gradeForScore,
  type FreeFinding,
  type FreeResult,
} from '../../../shared/free-services';
import { ValidationError } from '../utils/errors';

export async function runPhishingQuiz(input: {
  answers: Record<string, string> | undefined;
}): Promise<FreeResult> {
  const answers = input.answers ?? {};
  const findings: FreeFinding[] = [];
  let correct = 0;

  for (const scenario of PHISHING_SCENARIOS) {
    const raw = answers[scenario.id];
    if (raw === undefined) {
      throw new ValidationError('Please answer every scenario before submitting');
    }
    const index = Number(raw);
    const option = scenario.options[index];
    if (!Number.isInteger(index) || !option) {
      throw new ValidationError('One or more answers are invalid');
    }
    if (option.correct) {
      correct += 1;
    } else {
      findings.push({
        id: `phish.missed.${scenario.id}`,
        severity: 'low',
        title: `Missed: ${scenario.subject}`,
        meaning: option.explanation,
        consequence: scenario.lesson,
        recommendation: 'Pause, verify through an independent route, and report the message.',
        serviceKey: 'security_training',
        detail: `${scenario.channel} from ${scenario.sender}`,
      });
    }
  }

  const score = Math.round((correct / PHISHING_SCENARIOS.length) * 100);
  const summaryKey =
    score >= 90 ? 'phish.strong' : score >= 60 ? 'phish.some_risk' : 'phish.low_awareness';
  const copy = PHISHING_FINDING_COPY[summaryKey];
  if (copy) findings.unshift({ id: summaryKey, ...copy });

  const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    schemaVersion: FREE_RESULT_SCHEMA_VERSION,
    serviceKey: 'phishing_quiz',
    score,
    grade: gradeForScore(score),
    summary: `You recognised ${correct} of ${PHISHING_SCENARIOS.length} scenarios correctly.`,
    findings,
    checkedAt: new Date().toISOString(),
    meta: { answers, checksRun: PHISHING_SCENARIOS.length },
  };
}
