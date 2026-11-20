import type { Db } from '../database/db';
import {
  getAssessment,
  listControlAssessments,
  requireAssessment,
} from '../repositories/assessments';
import { getCustomer } from '../repositories/customers';
import {
  findingCounts,
  listFindingsForAssessment,
  severityBreakdown,
} from '../repositories/findings';
import { computeAssessmentScore, getSnapshot } from '../services/scoring';
import { generateRecommendations } from '../scoring/recommendations';
import { ORGANIZATION, REPORT_TYPE_LABELS, scoreBand } from '../../../shared/constants';
import type { ReportType } from '../../../shared/constants';
import type { Assessment, ScoreResult } from '../../../shared/types';
import { NotFoundError, ValidationError } from '../utils/errors';

export type Block =
  | { kind: 'heading'; text: string; level: 1 | 2 | 3 }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; align?: ('left' | 'right')[] }
  | {
      kind: 'chart';
      title: string;
      data: { label: string; value: number }[];
      max: number;
      unit: string;
    }
  | { kind: 'kv'; pairs: [string, string][] }
  | { kind: 'pagebreak' };

export interface ReportContent {
  reportKey: string;
  type: ReportType;
  title: string;
  classification: string;
  organization: string;
  generatedAt: string;
  generatedBy: string | null;
  generatedByName: string | null;
  customer: { name: string; industry: string; scope: string | null; contactName: string | null };
  assessment: {
    key: string;
    title: string;
    type: string;
    date: string;
    assessor: string;
    status: string;
    scope: string;
    fromSnapshot: boolean;
  };
  score: ScoreResult | null;
  limitations: string[];
  blocks: Block[];
}

const STATUS_LABEL: Record<string, string> = {
  effective: 'Effective',
  partially_effective: 'Partially effective',
  ineffective: 'Ineffective',
  not_assessed: 'Not assessed',
  not_applicable: 'Not applicable',
};

function fmtScore(value: number | null): string {
  return value === null ? 'Not available' : `${value.toFixed(1)}`;
}

function severityLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function baseLimitations(assessment: Assessment, score: ScoreResult): string[] {
  const items = [
    'Results reflect the evidence available to the assessor at the time of the assessment and the controls that were in scope.',
    'A health score is a risk-management indicator, not a guarantee that the environment is secure or free from compromise.',
  ];
  if (score.provisional) {
    items.push(
      `The overall score is provisional: coverage is ${score.coveragePct}% and the configured eligibility threshold is met only when every active category has at least one assessed applicable control.`,
    );
  }
  if (score.notApplicableControls > 0) {
    items.push(
      `${score.notApplicableControls} control(s) were excluded as not applicable and are documented with justifications.`,
    );
  }
  if (score.unassessedControls > 0) {
    items.push(
      `${score.unassessedControls} applicable control(s) remain unassessed and are excluded from the score denominator.`,
    );
  }
  items.push(`Scope of this assessment: ${assessment.scope}`);
  return items;
}

function scoreBlocks(score: ScoreResult): Block[] {
  const band = score.overallScore !== null ? scoreBand(score.overallScore) : null;
  const blocks: Block[] = [
    {
      kind: 'kv',
      pairs: [
        [
          'Overall health score',
          score.overallScore === null ? 'Not available' : `${fmtScore(score.overallScore)} / 100`,
        ],
        ['Interpretation', band ? band.label : 'Insufficient data'],
        [
          'Assessment coverage',
          `${score.coveragePct}% (${score.assessedControls} of ${score.applicableControls} applicable controls assessed)`,
        ],
        [
          'Score status',
          score.eligible ? 'Final' : 'Provisional - eligibility requirements not yet met',
        ],
        ['Scoring methodology version', `v${score.methodologyVersion}`],
        ['Calculated at', score.computedAt],
      ],
    },
  ];
  if (score.eligibilityReasons.length > 0) {
    blocks.push({
      kind: 'bullets',
      items: score.eligibilityReasons.map((r) => `Eligibility note: ${r}`),
    });
  }
  blocks.push({
    kind: 'chart',
    title: 'Category scores',
    data: score.categories.map((c) => ({ label: c.name, value: c.score ?? -1 })),
    max: 100,
    unit: '%',
  });
  blocks.push({
    kind: 'table',
    headers: ['Category', 'Weight', 'Score', 'Assessed', 'Unassessed', 'Not applicable'],
    rows: score.categories.map((c) => [
      c.name,
      `${c.weight}%`,
      c.score === null ? 'Unknown' : `${c.score.toFixed(1)}`,
      `${c.assessedControls}/${c.applicableControls}`,
      String(c.unassessedControls),
      String(c.notApplicableControls),
    ]),
    align: ['left', 'right', 'right', 'right', 'right', 'right'],
  });
  return blocks;
}

export async function buildReportContent(
  db: Db,
  assessmentId: string,
  type: ReportType,
  options: {
    generatedBy: string | null;
    generatedByName: string | null;
    reportKey: string;
    title?: string;
  },
): Promise<ReportContent> {
  const assessment = await requireAssessment(db, assessmentId);
  const customer = await getCustomer(db, assessment.customerId);
  if (!customer) throw new NotFoundError('Customer for this assessment no longer exists');

  const snapshot = await getSnapshot(db, assessment.id);
  const fromSnapshot = Boolean(snapshot);
  const score = await computeAssessmentScore(db, assessment);
  const controls = await listControlAssessments(db, assessment.id);
  const findings = await listFindingsForAssessment(db, assessment.id);
  const counts = await findingCounts(db, customer.id);
  const severities = await severityBreakdown(db, customer.id);
  const openFindings = findings.filter((f) => !['resolved', 'false_positive'].includes(f.status));
  const criticalHigh = openFindings.filter((f) => ['critical', 'high'].includes(f.severity));

  const recommendations = generateRecommendations({
    controls: controls.map((c) => ({
      controlKey: c.controlKey,
      controlName: c.controlName,
      categoryName: c.categoryName,
      status: c.status,
      evidenceNotes: c.evidenceNotes,
    })),
    findings: findings.map((f) => ({
      id: f.id,
      findingKey: f.findingKey,
      title: f.title,
      severity: f.severity,
      status: f.status,
      targetDate: f.targetDate,
      overdue: f.overdue,
      assigneeName: f.assigneeName,
    })),
  });

  const limitations = baseLimitations(assessment, score);
  const blocks: Block[] = [];
  const title =
    options.title?.trim() ||
    `${REPORT_TYPE_LABELS[type]} - ${customer.name} - ${assessment.assessmentKey}`;

  blocks.push({ kind: 'heading', text: title, level: 1 });
  blocks.push({
    kind: 'kv',
    pairs: [
      ['Report identifier', options.reportKey],
      ['Customer', customer.name],
      ['Industry', customer.industry],
      ['Assessment', `${assessment.assessmentKey} - ${assessment.title}`],
      ['Assessment type', statusLabel(assessment.type)],
      ['Assessment date', assessment.assessmentDate],
      ['Scope', assessment.scope],
      ['Assessor', assessment.assessor],
      ['Report generated', new Date().toISOString()],
      ['Generated by', options.generatedByName ?? 'System'],
      ['Prepared by', ORGANIZATION],
      ['Classification', 'Confidential - for authorised recipients only'],
    ],
  });

  if (type === 'executive') {
    const band = score.overallScore !== null ? scoreBand(score.overallScore) : null;
    blocks.push({ kind: 'heading', text: 'Executive summary', level: 2 });
    blocks.push({
      kind: 'paragraph',
      text:
        `${ORGANIZATION} completed a ${statusLabel(assessment.type).toLowerCase()} cybersecurity assessment of ${customer.name} ` +
        `on ${assessment.assessmentDate}. The assessment covered ${score.totalControls} security controls across ` +
        `${score.categories.length} categories, of which ${score.assessedControls} applicable controls were assessed ` +
        `(coverage ${score.coveragePct}%). ` +
        (score.overallScore === null
          ? 'No overall health score could be calculated because insufficient controls were assessed.'
          : `The resulting cybersecurity health score is ${fmtScore(score.overallScore)} out of 100, which is interpreted as "${band?.label ?? 'n/a'}". `) +
        `${counts.criticalOpen} critical and ${counts.highOpen} high-severity finding(s) remain open across the customer record.`,
    });
    blocks.push(...scoreBlocks(score));

    blocks.push({ kind: 'heading', text: 'Critical and high-risk findings', level: 2 });
    if (criticalHigh.length === 0) {
      blocks.push({
        kind: 'paragraph',
        text: 'No open critical or high-severity findings were recorded for this assessment.',
      });
    } else {
      blocks.push({
        kind: 'table',
        headers: ['ID', 'Title', 'Severity', 'Priority', 'Status', 'Target date'],
        rows: criticalHigh.map((f) => [
          f.findingKey,
          f.title,
          severityLabel(f.severity),
          f.priority,
          statusLabel(f.status),
          f.targetDate ?? '-',
        ]),
      });
    }

    blocks.push({ kind: 'heading', text: 'Key strengths', level: 2 });
    const strengths = score.categories.filter(
      (c) => c.score !== null && c.score >= 75 && c.unassessedControls === 0,
    );
    blocks.push({
      kind: 'bullets',
      items:
        strengths.length > 0
          ? strengths.map(
              (c) =>
                `${c.name}: scored ${c.score?.toFixed(1)} with all applicable controls assessed.`,
            )
          : ['No category achieved a strong score with complete coverage in this assessment.'],
    });

    blocks.push({ kind: 'heading', text: 'Key weaknesses', level: 2 });
    const weaknesses = score.categories.filter((c) => c.score === null || c.score < 60);
    const ineffective = controls.filter((c) => c.status === 'ineffective');
    blocks.push({
      kind: 'bullets',
      items: [
        ...weaknesses.map((c) =>
          c.score === null
            ? `${c.name}: no applicable control was assessed, so no score is available.`
            : `${c.name}: scored ${c.score.toFixed(1)}.`,
        ),
        ...ineffective.map((c) => `${c.controlKey} ${c.controlName}: assessed as ineffective.`),
        ...(weaknesses.length === 0 && ineffective.length === 0
          ? ['No category scored below 60; remaining gaps are listed under recommendations.']
          : []),
      ],
    });

    blocks.push({ kind: 'heading', text: 'Prioritised recommendations', level: 2 });
    if (recommendations.length === 0) {
      blocks.push({
        kind: 'paragraph',
        text: 'No rule-based recommendations were triggered by this assessment.',
      });
    }
    recommendations.forEach((r, i) => {
      blocks.push({
        kind: 'heading',
        text: `${i + 1}. ${r.title} (${r.priority} priority)`,
        level: 3,
      });
      blocks.push({ kind: 'paragraph', text: r.explanation });
      blocks.push({ kind: 'bullets', items: r.nextSteps });
      blocks.push({
        kind: 'paragraph',
        text: `Trigger: ${r.trigger}. Rationale: ${r.rationale}${r.timeframe ? ` Suggested timeframe: ${r.timeframe}.` : ''}`,
      });
    });

    blocks.push({ kind: 'heading', text: 'Remediation progress', level: 2 });
    blocks.push({
      kind: 'kv',
      pairs: [
        ['Total findings (customer record)', String(counts.total)],
        ['Open', String(counts.open)],
        ['In progress', String(counts.inProgress)],
        ['Pending verification', String(counts.pendingVerification)],
        ['Resolved', String(counts.resolved)],
        ['Accepted risk', String(counts.acceptedRisk)],
        ['Overdue', String(counts.overdue)],
      ],
    });

    blocks.push({ kind: 'heading', text: 'Outstanding risks', level: 2 });
    const outstanding = openFindings.filter((f) => ['critical', 'high'].includes(f.severity));
    blocks.push({
      kind: 'bullets',
      items:
        outstanding.length > 0
          ? outstanding.map(
              (f) =>
                `${f.findingKey} (${severityLabel(f.severity)}, ${f.priority}): ${f.title}${f.targetDate ? ` - target ${f.targetDate}` : ''}`,
            )
          : ['No open critical or high-severity findings are outstanding for this assessment.'],
    });

    blocks.push({ kind: 'heading', text: 'Next steps', level: 2 });
    blocks.push({
      kind: 'bullets',
      items: [
        'Review this report with the assessor and confirm that the recorded evidence matches management understanding.',
        'Assign owners and target dates to every open critical and high-severity finding.',
        'Schedule verification of remediated findings before they are closed.',
        `Agree a follow-up assessment${score.provisional ? ' once coverage reaches the configured threshold' : ' to measure improvement'} `,
      ],
    });
  }

  if (type === 'technical') {
    blocks.push({ kind: 'heading', text: 'Assessment methodology', level: 2 });
    blocks.push({
      kind: 'paragraph',
      text:
        `Controls were assessed against the ODCMP control library (methodology v${score.methodologyVersion}) using the default rubric: ` +
        'Effective = 100, Partially effective = 50, Ineffective = 0. Controls marked Not assessed receive no numeric score and are excluded from the denominator; ' +
        'controls marked Not applicable are excluded after a recorded justification. Category scores are weighted means of assessed applicable controls, ' +
        'and the overall score is the weighted mean of eligible category scores.',
    });
    blocks.push({
      kind: 'kv',
      pairs: [
        ['Scope', assessment.scope],
        ['Coverage', `${score.coveragePct}%`],
        ['Applicable controls', String(score.applicableControls)],
        ['Assessed controls', String(score.assessedControls)],
        ['Unassessed controls', String(score.unassessedControls)],
        ['Not applicable controls', String(score.notApplicableControls)],
        ['Overall score', fmtScore(score.overallScore)],
      ],
    });
    blocks.push(...scoreBlocks(score));

    blocks.push({ kind: 'heading', text: 'Control results', level: 2 });
    blocks.push({
      kind: 'table',
      headers: ['Control', 'Category', 'Result', 'Score', 'Evidence summary'],
      rows: controls.map((c) => [
        `${c.controlKey} ${c.controlName}`,
        c.categoryName,
        STATUS_LABEL[c.status] ?? c.status,
        c.score === null ? '-' : String(c.score),
        (c.evidenceNotes || c.justification || 'No evidence recorded').slice(0, 220),
      ]),
    });

    blocks.push({ kind: 'pagebreak' });
    blocks.push({ kind: 'heading', text: 'Findings', level: 2 });
    if (findings.length === 0) {
      blocks.push({
        kind: 'paragraph',
        text: 'No findings were recorded against this assessment.',
      });
    }
    findings.forEach((f) => {
      blocks.push({ kind: 'heading', text: `${f.findingKey}: ${f.title}`, level: 3 });
      blocks.push({
        kind: 'kv',
        pairs: [
          [
            'Severity / priority',
            `${severityLabel(f.severity)} / ${f.priority} (${f.prioritySource})`,
          ],
          ['Status', statusLabel(f.status)],
          ['Affected asset', f.asset ?? 'Not specified'],
          ['Component', f.component ?? 'Not specified'],
          ['Discovered', f.discoveredDate],
          ['Target remediation date', f.targetDate ?? 'Not set'],
          ['Assignee', f.assigneeName ?? 'Unassigned'],
          ['External reference', f.externalRef ?? 'None'],
          [
            'Verification status',
            f.status === 'resolved'
              ? 'Resolved and verified'
              : f.status === 'pending_verification'
                ? 'Awaiting verification'
                : 'Not yet verified',
          ],
        ],
      });
      blocks.push({ kind: 'paragraph', text: `Description: ${f.description}` });
      blocks.push({ kind: 'paragraph', text: `Evidence: ${f.evidence ?? 'No evidence recorded'}` });
      blocks.push({
        kind: 'paragraph',
        text: `Recommended remediation: ${f.recommendedRemediation ?? 'Not provided'}`,
      });
      if (f.resolutionNotes)
        blocks.push({ kind: 'paragraph', text: `Resolution notes: ${f.resolutionNotes}` });
      if (f.verificationEvidence)
        blocks.push({
          kind: 'paragraph',
          text: `Verification evidence: ${f.verificationEvidence}`,
        });
    });

    blocks.push({ kind: 'heading', text: 'Assessment limitations', level: 2 });
    blocks.push({ kind: 'bullets', items: limitations });
  }

  if (type === 'remediation') {
    blocks.push({ kind: 'heading', text: 'Findings by severity', level: 2 });
    blocks.push({
      kind: 'table',
      headers: ['Severity', 'Total findings', 'Open (incl. in progress and pending verification)'],
      rows: severities.map((s) => {
        const scoped = findings.filter((f) => f.severity === s.severity);
        return [
          severityLabel(s.severity),
          String(s.count),
          String(
            scoped.filter((f) => ['open', 'in_progress', 'pending_verification'].includes(f.status))
              .length,
          ),
        ];
      }),
      align: ['left', 'right', 'right'],
    });

    blocks.push({ kind: 'heading', text: 'Findings by status', level: 2 });
    const statuses = [
      'open',
      'in_progress',
      'pending_verification',
      'resolved',
      'accepted_risk',
      'false_positive',
    ];
    blocks.push({
      kind: 'table',
      headers: ['Status', 'Customer total', 'This assessment'],
      rows: statuses.map((s) => [
        statusLabel(s),
        String(
          s === 'open'
            ? counts.open - counts.inProgress - counts.pendingVerification
            : s === 'in_progress'
              ? counts.inProgress
              : s === 'pending_verification'
                ? counts.pendingVerification
                : s === 'resolved'
                  ? counts.resolved
                  : s === 'accepted_risk'
                    ? counts.acceptedRisk
                    : counts.falsePositive,
        ),
        String(findings.filter((f) => f.status === s).length),
      ]),
      align: ['left', 'right', 'right'],
    });

    const overdue = findings.filter((f) => f.overdue);
    blocks.push({ kind: 'heading', text: 'Overdue findings', level: 2 });
    blocks.push({
      kind: 'table',
      headers: ['ID', 'Title', 'Severity', 'Status', 'Target date', 'Assignee'],
      rows:
        overdue.length > 0
          ? overdue.map((f) => [
              f.findingKey,
              f.title,
              severityLabel(f.severity),
              statusLabel(f.status),
              f.targetDate ?? '-',
              f.assigneeName ?? 'Unassigned',
            ])
          : [['-', 'No overdue findings in this assessment', '-', '-', '-', '-']],
    });

    blocks.push({ kind: 'heading', text: 'Remediation progress', level: 2 });
    const total = findings.length;
    const resolved = findings.filter((f) => f.status === 'resolved').length;
    const pending = findings.filter((f) => f.status === 'pending_verification').length;
    blocks.push({
      kind: 'kv',
      pairs: [
        ['Findings in this assessment', String(total)],
        ['Resolved', String(resolved)],
        ['Pending verification', String(pending)],
        [
          'Resolved and verified percentage',
          total > 0 ? `${Math.round((resolved / total) * 100)}%` : 'Not applicable',
        ],
        ['Overdue (customer record)', String(counts.overdue)],
      ],
    });

    blocks.push({ kind: 'heading', text: 'Resolved findings', level: 2 });
    const resolvedItems = findings.filter((f) => f.status === 'resolved');
    blocks.push({
      kind: 'table',
      headers: ['ID', 'Title', 'Resolved at', 'Resolution summary'],
      rows:
        resolvedItems.length > 0
          ? resolvedItems.map((f) => [
              f.findingKey,
              f.title,
              f.resolvedAt ?? '-',
              (f.resolutionNotes || 'No resolution notes recorded').slice(0, 200),
            ])
          : [['-', 'No findings have been resolved yet', '-', '-']],
    });

    blocks.push({ kind: 'heading', text: 'Findings pending verification', level: 2 });
    const pendingItems = findings.filter((f) => f.status === 'pending_verification');
    blocks.push({
      kind: 'table',
      headers: ['ID', 'Title', 'Severity', 'Assignee'],
      rows:
        pendingItems.length > 0
          ? pendingItems.map((f) => [
              f.findingKey,
              f.title,
              severityLabel(f.severity),
              f.assigneeName ?? 'Unassigned',
            ])
          : [['-', 'No findings are awaiting verification', '-', '-']],
    });

    blocks.push({ kind: 'heading', text: 'Accepted risks', level: 2 });
    const accepted = findings.filter((f) => f.status === 'accepted_risk');
    blocks.push({
      kind: 'table',
      headers: ['ID', 'Title', 'Severity', 'Notes'],
      rows:
        accepted.length > 0
          ? accepted.map((f) => [
              f.findingKey,
              f.title,
              severityLabel(f.severity),
              f.resolutionNotes ?? 'See risk acceptance record',
            ])
          : [['-', 'No risks have been formally accepted', '-', '-']],
    });

    blocks.push({ kind: 'heading', text: 'Items requiring management attention', level: 2 });
    const attention = [
      ...(counts.overdue > 0
        ? [`${counts.overdue} remediation item(s) are past their target date.`]
        : []),
      ...(counts.criticalOpen > 0
        ? [`${counts.criticalOpen} critical finding(s) remain open.`]
        : []),
      ...(counts.pendingVerification > 0
        ? [
            `${counts.pendingVerification} finding(s) await verification and must not be reported as fixed.`,
          ]
        : []),
      ...(counts.acceptedRisk > 0
        ? [
            `${counts.acceptedRisk} finding(s) are accepted risks; confirm the acceptance and review date.`,
          ]
        : []),
      ...(counts.criticalOpen === 0 && counts.overdue === 0
        ? ['No critical findings or overdue items require escalation at this time.']
        : []),
    ];
    blocks.push({ kind: 'bullets', items: attention });
    blocks.push({ kind: 'heading', text: 'Assessment limitations', level: 2 });
    blocks.push({ kind: 'bullets', items: limitations });
  }

  return {
    reportKey: options.reportKey,
    type,
    title,
    classification: 'Confidential',
    organization: ORGANIZATION,
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy,
    generatedByName: options.generatedByName,
    customer: {
      name: customer.name,
      industry: customer.industry,
      scope: customer.scope,
      contactName: customer.contactName,
    },
    assessment: {
      key: assessment.assessmentKey,
      title: assessment.title,
      type: assessment.type,
      date: assessment.assessmentDate,
      assessor: assessment.assessor,
      status: assessment.status,
      scope: assessment.scope,
      fromSnapshot,
    },
    score,
    limitations,
    blocks,
  };
}

export function assertReportable(assessment: Assessment): void {
  if (assessment.status === 'draft') {
    throw new ValidationError(
      'This assessment is still a draft. Complete at least the required controls before generating a report.',
    );
  }
}

export async function loadAssessmentOrThrow(db: Db, id: string): Promise<Assessment> {
  const a = await getAssessment(db, id);
  if (!a) throw new NotFoundError('Assessment not found');
  return a;
}
