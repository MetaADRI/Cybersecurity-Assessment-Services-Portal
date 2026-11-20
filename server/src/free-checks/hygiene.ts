import {
  FREE_RESULT_SCHEMA_VERSION,
  HYGIENE_QUESTIONS,
  findingPenalty,
  gradeForScore,
  resultSummary,
  type FreeFinding,
  type FreeResult,
} from '../../../shared/free-services';
import { ValidationError } from '../utils/errors';

const VALUE_SCORE: Record<string, number> = { yes: 1, partly: 0.5, no: 0 };

export async function runHygieneAssessment(input: {
  answers: Record<string, string> | undefined;
}): Promise<FreeResult> {
  const answers = input.answers ?? {};
  const missing = HYGIENE_QUESTIONS.filter((question) => !(question.id in answers));
  if (missing.length > 0) {
    throw new ValidationError('Please answer every question before submitting');
  }

  let earned = 0;
  let possible = 0;
  const findings: FreeFinding[] = [];

  for (const question of HYGIENE_QUESTIONS) {
    const answer = answers[question.id];
    if (!answer || !(answer in VALUE_SCORE)) {
      throw new ValidationError('Please answer every question before submitting');
    }
    possible += question.weight;
    earned += question.weight * VALUE_SCORE[answer];
    if (answer !== 'yes') {
      findings.push({
        id: question.id,
        ...question.finding,
        ...(answer === 'partly' ? { detail: 'You answered: partly' } : {}),
      });
    }
  }

  const score = Math.round((earned / possible) * 100);
  const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const penaltyScore = Math.max(
    0,
    100 - findings.reduce((total, item) => total + findingPenalty(item.severity) / 2, 0),
  );

  return {
    schemaVersion: FREE_RESULT_SCHEMA_VERSION,
    serviceKey: 'hygiene_assessment',
    score,
    grade: gradeForScore(score),
    summary:
      score >= 80
        ? `Strong basics at ${score}%. Keep the disciplines that are working and close the remaining gaps.`
        : resultSummary(penaltyScore, findings),
    findings,
    checkedAt: new Date().toISOString(),
    meta: { answers, checksRun: HYGIENE_QUESTIONS.length },
  };
}
