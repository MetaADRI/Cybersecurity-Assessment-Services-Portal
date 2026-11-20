import type { FreeResult, FreeServiceKey } from '../../../shared/free-services';
import type { PublicFreeRunInput } from '../../../shared/client-schemas';
import { runWebsiteCheck } from './website';
import { runEmailCheck } from './email';
import { runEmailPhishingCheck } from './email-phishing';
import { runHygieneAssessment } from './hygiene';
import { runPhishingQuiz } from './phishing';
import { runSubnetCalculator } from './subnet';

export function runFreeCheck(
  serviceKey: FreeServiceKey,
  input: PublicFreeRunInput,
): Promise<FreeResult> {
  switch (serviceKey) {
    case 'website_check':
      return runWebsiteCheck({
        target: input.target ?? '',
        consentConfirmed: input.consentConfirmed,
      });
    case 'email_check':
      return runEmailCheck({
        target: input.target ?? '',
        consentConfirmed: input.consentConfirmed,
      });
    case 'email_phishing_check':
      return runEmailPhishingCheck({ target: input.target ?? '' });
    case 'hygiene_assessment':
      return runHygieneAssessment({ answers: input.answers });
    case 'phishing_quiz':
      return runPhishingQuiz({ answers: input.answers });
    case 'subnet_calculator':
      return runSubnetCalculator({ target: input.target ?? '' });
  }
}
