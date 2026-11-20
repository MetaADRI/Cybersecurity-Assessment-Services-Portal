/**
 * Deterministic recommendation engine.
 *
 * Every recommendation is produced by a rule that matches real persisted data:
 * a control assessment result or an actual finding. Nothing here invents
 * evidence, and no AI-generated text is involved.
 */
import type { ControlStatus, FindingStatus, Severity } from '../../../shared/constants';

export interface RecommendationControl {
  controlKey: string;
  controlName: string;
  categoryName: string;
  status: ControlStatus;
  evidenceNotes?: string | null;
}

export interface RecommendationFinding {
  id: string;
  findingKey: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  targetDate?: string | null;
  overdue?: boolean;
  assigneeName?: string | null;
}

export interface Recommendation {
  ruleId: string;
  title: string;
  explanation: string;
  trigger: string;
  priority: 'high' | 'medium' | 'low';
  nextSteps: string[];
  timeframe?: string;
  rationale: string;
}

interface Rule {
  id: string;
  title: string;
  triggerLabel: string;
  priority: Recommendation['priority'];
  timeframe?: string;
  explanation: (subject: string) => string;
  nextSteps: string[];
  rationale: string;
}

const CONTROL_RULES: (Rule & { controlKeys: string[]; statuses: ControlStatus[] })[] = [
  {
    id: 'mfa-not-enforced',
    controlKeys: ['IAM-01'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Roll out multi-factor authentication',
    triggerLabel: 'MFA enforcement control',
    priority: 'high',
    timeframe: '30 days',
    explanation: (s) =>
      `MFA enforcement was assessed as "${s}" during the assessment, so accounts can be compromised with stolen credentials alone.`,
    nextSteps: [
      'Identify all accounts that can access the assessed environment, including administrative and remote-access accounts.',
      'Enable MFA for those accounts and require re-authentication for privileged operations.',
      'Document exclusions with a business justification and re-assess the control.',
    ],
    rationale:
      'Credential theft remains the most common initial access vector; MFA is the cheapest control that disrupts it.',
  },
  {
    id: 'least-privilege',
    controlKeys: ['IAM-02'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Remediate excessive privileges',
    triggerLabel: 'Least-privilege control',
    priority: 'high',
    timeframe: '45 days',
    explanation: (s) =>
      `Least-privilege access was assessed as "${s}", which increases the blast radius of any compromised account.`,
    nextSteps: [
      'Inventory privileged roles and remove standing rights that are not required.',
      'Move administrative work to time-bound or approval-based elevation.',
      'Record an access review cadence and retain the evidence.',
    ],
    rationale:
      'Reducing standing privilege limits lateral movement and contains the impact of account compromise.',
  },
  {
    id: 'critical-vuln-remediation',
    controlKeys: ['VM-02'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Accelerate critical vulnerability remediation',
    triggerLabel: 'Critical vulnerability remediation control',
    priority: 'high',
    timeframe: '14 days',
    explanation: (s) =>
      `Critical vulnerability remediation was assessed as "${s}", meaning known critical issues are not being closed within an acceptable time.`,
    nextSteps: [
      'Confirm the current list of open critical vulnerabilities and their owners.',
      'Set a remediation service level (for example 7 days for critical, 30 days for high).',
      'Track exceptions formally and verify fixes before closing them.',
    ],
    rationale:
      'Unremediated critical vulnerabilities are the most likely issues to be exploited against the organisation.',
  },
  {
    id: 'patch-management',
    controlKeys: ['VM-03'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Formalise patch management',
    triggerLabel: 'Patch management control',
    priority: 'medium',
    timeframe: '60 days',
    explanation: (s) => `Patch management was assessed as "${s}".`,
    nextSteps: [
      'Define patch cycles for operating systems and third-party software.',
      'Produce a monthly compliance report showing applied and outstanding patches.',
      'Handle out-of-band patches for actively exploited vulnerabilities.',
    ],
    rationale:
      'A repeatable patch process closes the majority of known exploitable weaknesses over time.',
  },
  {
    id: 'backup-restoration-untested',
    controlKeys: ['IR-04'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Run a documented backup restoration test',
    triggerLabel: 'Backup restoration testing control',
    priority: 'high',
    timeframe: '30 days',
    explanation: (s) =>
      `Backup restoration testing was assessed as "${s}", so restore capability is assumed rather than proven.`,
    nextSteps: [
      'Restore a representative backup into an isolated environment.',
      'Record recovery time, data integrity checks and any failures.',
      'Schedule the test at least quarterly and keep the evidence.',
    ],
    rationale:
      'Backups that have never been restored cannot be relied on during ransomware or data-loss incidents.',
  },
  {
    id: 'incident-response-missing',
    controlKeys: ['IR-01', 'IR-02'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Develop and exercise incident response procedures',
    triggerLabel: 'Incident response procedure control',
    priority: 'high',
    timeframe: '60 days',
    explanation: (s) => `Incident response readiness was assessed as "${s}".`,
    nextSteps: [
      'Document roles, escalation paths and communication rules for a security incident.',
      'Run a tabletop exercise and capture lessons learned.',
      'Review and re-test the plan after each significant incident.',
    ],
    rationale:
      'Response quality during the first hours of an incident determines how much damage is contained.',
  },
  {
    id: 'awareness-coverage-low',
    controlKeys: ['SA-01', 'SA-02'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Run a targeted security awareness programme',
    triggerLabel: 'Security awareness control',
    priority: 'medium',
    timeframe: '90 days',
    explanation: (s) => `Security awareness was assessed as "${s}".`,
    nextSteps: [
      'Deliver baseline training to all staff with completion tracking.',
      'Run phishing simulations and targeted follow-up training for repeat failures.',
      'Publish a simple incident-reporting route for staff.',
    ],
    rationale:
      'Awareness controls reduce the chance that a phishing email or suspicious event becomes an incident.',
  },
  {
    id: 'endpoint-coverage-gap',
    controlKeys: ['EP-01'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Close endpoint protection coverage gaps',
    triggerLabel: 'Endpoint protection coverage control',
    priority: 'high',
    timeframe: '30 days',
    explanation: (s) => `Endpoint protection coverage was assessed as "${s}".`,
    nextSteps: [
      'Reconcile the asset inventory against endpoints reporting to the protection platform.',
      'Deploy agents to unmatched endpoints and resolve machines failing health checks.',
      'Alert on any endpoint that stops reporting.',
    ],
    rationale: 'Unmanaged endpoints are both unprotected and invisible to monitoring.',
  },
  {
    id: 'firewall-review-overdue',
    controlKeys: ['CN-02'],
    statuses: ['ineffective', 'partially_effective'],
    title: 'Review firewall and network rules',
    triggerLabel: 'Firewall configuration review control',
    priority: 'medium',
    timeframe: '45 days',
    explanation: (s) => `Firewall configuration review was assessed as "${s}".`,
    nextSteps: [
      'Export and review rule sets, removing any any-any or unused rules.',
      'Confirm change control and periodic recertification of rules.',
      'Document the review and its outcomes as evidence.',
    ],
    rationale:
      'Stale network rules silently widen exposure long after the original requirement has expired.',
  },
];

export function generateRecommendations(input: {
  controls: RecommendationControl[];
  findings: RecommendationFinding[];
}): Recommendation[] {
  const out: Recommendation[] = [];
  const seen = new Set<string>();

  for (const rule of CONTROL_RULES) {
    const match = input.controls.find(
      (c) => rule.controlKeys.includes(c.controlKey) && rule.statuses.includes(c.status),
    );
    if (!match || seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push({
      ruleId: rule.id,
      title: rule.title,
      explanation: rule.explanation(match.status.replace(/_/g, ' ')),
      trigger: `${rule.triggerLabel} (${match.controlKey}) scored "${match.status.replace(/_/g, ' ')}"`,
      priority: rule.priority,
      nextSteps: rule.nextSteps,
      timeframe: rule.timeframe,
      rationale: rule.rationale,
    });
  }

  const open = input.findings.filter((f) => !['resolved', 'false_positive'].includes(f.status));
  const critical = open.filter((f) => f.severity === 'critical');
  if (critical.length > 0) {
    out.push({
      ruleId: 'open-critical-findings',
      title: 'Investigate and remediate open critical findings',
      explanation: `${critical.length} critical finding(s) are outstanding (${critical
        .map((f) => f.findingKey)
        .join(', ')}). A high overall score does not offset an unresolved critical issue.`,
      trigger: `Open critical findings: ${critical.map((f) => f.findingKey).join(', ')}`,
      priority: 'high',
      timeframe: 'Immediate',
      nextSteps: [
        'Confirm each critical finding with the system owner and assign an owner for remediation.',
        'Apply containment or mitigating controls where a fix cannot be deployed immediately.',
        'Verify the fix with evidence before closing the finding.',
      ],
      rationale:
        'Critical findings represent the largest immediate risk regardless of aggregate scoring.',
    });
  }

  const overdue = open.filter((f) => f.overdue);
  if (overdue.length > 0) {
    out.push({
      ruleId: 'overdue-remediation',
      title: 'Recover overdue remediation items',
      explanation: `${overdue.length} remediation item(s) have passed their target date.`,
      trigger: `Overdue: ${overdue.map((f) => f.findingKey).join(', ')}`,
      priority: 'medium',
      timeframe: '14 days',
      nextSteps: [
        'Re-triage overdue items with the assigned owners.',
        'Re-set realistic target dates where the original date is no longer achievable and record the reason.',
        'Escalate items with no owner.',
      ],
      rationale:
        'Repeatedly missed target dates indicate capacity or prioritisation problems that management should resolve.',
    });
  }

  const unverified = input.findings.filter((f) => f.status === 'pending_verification');
  if (unverified.length > 0) {
    out.push({
      ruleId: 'pending-verification',
      title: 'Complete verification of proposed fixes',
      explanation: `${unverified.length} finding(s) are waiting for verification and must not be treated as remediated yet.`,
      trigger: `Pending verification: ${unverified.map((f) => f.findingKey).join(', ')}`,
      priority: 'medium',
      timeframe: '14 days',
      nextSteps: [
        'Independently confirm each proposed fix with evidence.',
        'Return findings that fail verification to in-progress status with notes.',
        'Record verification evidence against the finding.',
      ],
      rationale: 'A status change is not proof that a vulnerability was actually fixed.',
    });
  }

  const accepted = input.findings.filter((f) => f.status === 'accepted_risk');
  if (accepted.length > 0) {
    out.push({
      ruleId: 'accepted-risk-review',
      title: 'Review accepted risks with management',
      explanation: `${accepted.length} finding(s) have been formally accepted as risk and require periodic review.`,
      trigger: `Accepted risk: ${accepted.map((f) => f.findingKey).join(', ')}`,
      priority: 'low',
      timeframe: 'Next review cycle',
      nextSteps: [
        'Confirm the acceptance is still valid and correctly scoped.',
        'Review any review date that is approaching.',
        'Record the business owner who accepted the risk.',
      ],
      rationale: 'Risk acceptances expire in value if they are never revisited.',
    });
  }

  return out;
}
