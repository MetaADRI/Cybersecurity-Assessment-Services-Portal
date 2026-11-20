import type { Db } from './db';
import { nowIso, addDays } from '../utils/time';
import { createCustomer } from '../repositories/customers';
import {
  createAssessment,
  getAssessment,
  updateAssessment,
  upsertControlAssessment,
} from '../repositories/assessments';
import { listControls, getScoringSettings } from '../repositories/settings';
import { createFinding, changeFindingStatus, addActivity } from '../repositories/findings';
import { buildScoreInput, completeAssessment } from '../services/scoring';
import { computeScore } from '../scoring/engine';
import { recordAudit } from '../repositories/audit';
import { listUsers } from '../repositories/users';
import { calculatePriority, priorityFactorsFrom } from '../scoring/priority';
import type { ControlStatus, Severity } from '../../../shared/constants';
import { CURRENT_METHODOLOGY_VERSION } from '../../../shared/constants';

/**
 * Loads fictional demonstration data.
 *
 * - Organisation names end with "(Demo)" and all contact addresses use
 *   example.com, so seeded records can never be mistaken for real customers.
 * - Every seeded record is flagged is_demo = 1 and can be removed again with
 *   `npm run db:seed -- --replace` (only demo records are removed).
 * - The seed never creates user accounts or passwords.
 */

interface SeedFinding {
  key: string;
  title: string;
  description: string;
  severity: Severity;
  asset: string;
  component?: string;
  assessmentIndex?: number;
  customerIndex: number;
  status:
    | 'open'
    | 'in_progress'
    | 'pending_verification'
    | 'resolved'
    | 'accepted_risk'
    | 'false_positive';
  targetDaysFromNow?: number;
  discovered: string;
  evidence?: string;
  remediation: string;
  externalRef?: string;
  exploitability?: 'unknown' | 'weaponized' | 'poc' | 'public' | 'not_exploitable';
  exposure?: 'unknown' | 'internet' | 'internal' | 'restricted';
  impact?: 'unknown' | 'high' | 'medium' | 'low';
}

export async function purgeDemoData(db: Db): Promise<void> {
  await db.transaction(async () => {
    await db
      .prepare(
        'DELETE FROM reports WHERE customer_id IN (SELECT id FROM customers WHERE is_demo = 1)',
      )
      .run();
    await db.prepare('DELETE FROM findings WHERE is_demo = 1').run();
    await db.prepare('DELETE FROM assessments WHERE is_demo = 1').run();
    await db.prepare('DELETE FROM customers WHERE is_demo = 1').run();
    await db
      .prepare(
        "DELETE FROM sequences WHERE name IN ('customer', 'assessment', 'finding', 'report')",
      )
      .run();
  })();
}

export async function hasDemoData(db: Db): Promise<boolean> {
  const row = (await db.prepare('SELECT COUNT(*) AS c FROM customers WHERE is_demo = 1').get<{
    c: string | number;
  }>()) ?? { c: 0 };
  return Number(row.c) > 0;
}

export interface SeedResult {
  customers: number;
  assessments: number;
  findings: number;
  replaced: boolean;
}

export async function seedDemoData(db: Db, opts: { replace?: boolean } = {}): Promise<SeedResult> {
  const existing = await hasDemoData(db);
  if (existing && !opts.replace) {
    throw new Error(
      'Demonstration data already exists. Re-run with --replace to remove and reload it.',
    );
  }
  if (existing && opts.replace) await purgeDemoData(db);

  const users = await listUsers(db);
  const creator = users[0]?.id ?? null;
  const controls = await listControls(db, { includeInactive: false });
  const settings = await getScoringSettings(db);

  // --- Customers ---------------------------------------------------------
  const customersData = [
    {
      name: 'Copperbelt Financial Group (Demo)',
      description:
        'Fictional retail bank used for demonstration purposes. Not a real organisation.',
      industry: 'Banking and Financial Services',
      contactName: 'Mwansa Banda (fictional)',
      contactEmail: 'mwansa.banda@example.com',
      phone: '+260 970 000 001',
      scope:
        'Core banking platform, customer internet banking portal, branch network and corporate endpoints across three Lusaka branches.',
    },
    {
      name: 'Zambezi Freight & Logistics (Demo)',
      description: 'Fictional transport and logistics company used for demonstration purposes.',
      industry: 'Transport and Logistics',
      contactName: 'Chanda Mwelwa (fictional)',
      contactEmail: 'chanda.mwelwa@example.com',
      phone: '+260 970 000 002',
      scope:
        'Warehouse management system, vehicle telematics, depot wireless network and office endpoints.',
    },
    {
      name: 'Luangwa Valley Health Trust (Demo)',
      description: 'Fictional non-profit health provider used for demonstration purposes.',
      industry: 'Healthcare and Social Assistance',
      contactName: 'Natasha Phiri (fictional)',
      contactEmail: 'natasha.phiri@example.com',
      phone: '+260 970 000 003',
      scope:
        'Electronic records system, clinic endpoints, medical imaging storage and head-office network.',
    },
  ];
  const customers = [];
  for (const c of customersData) {
    customers.push(await createCustomer(db, { ...c, createdBy: creator, isDemo: true }));
  }

  // --- Assessments -------------------------------------------------------

  /** Status pattern keyed by control key. Anything omitted is `not_assessed`. */
  type Pattern = Record<string, ControlStatus>;

  const patterns: { customerIndex: number; pattern: Pattern }[] = [
    {
      // Copperbelt baseline (March) - weakest posture
      customerIndex: 0,
      pattern: {
        'IAM-01': 'ineffective',
        'IAM-02': 'partially_effective',
        'IAM-03': 'partially_effective',
        'IAM-04': 'ineffective',
        'VM-01': 'partially_effective',
        'VM-02': 'ineffective',
        'VM-03': 'partially_effective',
        'VM-04': 'ineffective',
        'EP-01': 'partially_effective',
        'EP-02': 'ineffective',
        'EP-03': 'partially_effective',
        'EP-04': 'ineffective',
        'CN-01': 'partially_effective',
        'CN-02': 'ineffective',
        'CN-03': 'partially_effective',
        'CN-04': 'ineffective',
        'SA-01': 'ineffective',
        'SA-02': 'not_applicable',
        'SA-03': 'partially_effective',
        'IR-01': 'partially_effective',
        'IR-02': 'not_assessed',
        'IR-03': 'partially_effective',
        'IR-04': 'not_assessed',
      },
    },
    {
      // Copperbelt reassessment (September) - improved, same scope
      customerIndex: 0,
      pattern: {
        'IAM-01': 'effective',
        'IAM-02': 'partially_effective',
        'IAM-03': 'effective',
        'IAM-04': 'partially_effective',
        'VM-01': 'effective',
        'VM-02': 'partially_effective',
        'VM-03': 'effective',
        'VM-04': 'partially_effective',
        'EP-01': 'effective',
        'EP-02': 'partially_effective',
        'EP-03': 'effective',
        'EP-04': 'partially_effective',
        'CN-01': 'effective',
        'CN-02': 'partially_effective',
        'CN-03': 'effective',
        'CN-04': 'partially_effective',
        'SA-01': 'partially_effective',
        'SA-02': 'not_applicable',
        'SA-03': 'effective',
        'IR-01': 'effective',
        'IR-02': 'partially_effective',
        'IR-03': 'effective',
        'IR-04': 'partially_effective',
      },
    },
    {
      // Zambezi Freight baseline - middling, deliberately incomplete
      customerIndex: 1,
      pattern: {
        'IAM-01': 'partially_effective',
        'IAM-02': 'ineffective',
        'IAM-03': 'not_applicable',
        'IAM-04': 'partially_effective',
        'VM-01': 'partially_effective',
        'VM-02': 'partially_effective',
        'VM-03': 'ineffective',
        'VM-04': 'not_assessed',
        'EP-01': 'effective',
        'EP-02': 'partially_effective',
        'EP-03': 'partially_effective',
        'EP-04': 'not_assessed',
        'CN-01': 'partially_effective',
        'CN-02': 'partially_effective',
        'CN-03': 'not_applicable',
        'CN-04': 'not_assessed',
        'SA-01': 'effective',
        'SA-02': 'partially_effective',
        'SA-03': 'effective',
        'IR-01': 'partially_effective',
        'IR-02': 'not_assessed',
        'IR-03': 'effective',
        'IR-04': 'ineffective',
      },
    },
    {
      // Luangwa Valley Health - in progress, low coverage (provisional score)
      customerIndex: 2,
      pattern: {
        'IAM-01': 'partially_effective',
        'IAM-02': 'ineffective',
        'IAM-03': 'not_assessed',
        'IAM-04': 'not_assessed',
        'VM-01': 'not_assessed',
        'VM-02': 'not_assessed',
        'VM-03': 'partially_effective',
        'VM-04': 'not_assessed',
        'EP-01': 'effective',
        'EP-02': 'not_assessed',
        'EP-03': 'not_assessed',
        'EP-04': 'not_assessed',
        'CN-01': 'not_assessed',
        'CN-02': 'not_assessed',
        'CN-03': 'not_applicable',
        'CN-04': 'not_assessed',
        'SA-01': 'not_assessed',
        'SA-02': 'not_applicable',
        'SA-03': 'not_assessed',
        'IR-01': 'partially_effective',
        'IR-02': 'not_assessed',
        'IR-03': 'not_assessed',
        'IR-04': 'not_assessed',
      },
    },
  ];

  const assessmentSpecs = [
    {
      customerIndex: 0,
      title: 'Baseline cybersecurity assessment',
      type: 'baseline' as const,
      date: '2026-03-10',
      status: 'completed' as const,
      patternIndex: 0,
      description: 'First formal assessment of the core banking environment.',
    },
    {
      customerIndex: 0,
      title: 'Six-month reassessment',
      type: 'reassessment' as const,
      date: '2026-09-15',
      status: 'completed' as const,
      patternIndex: 1,
      description: 'Reassessment of the same scope to measure improvement.',
    },
    {
      customerIndex: 1,
      title: 'Depot and warehouse baseline assessment',
      type: 'baseline' as const,
      date: '2026-06-22',
      status: 'completed' as const,
      patternIndex: 2,
      description: 'Baseline covering warehouse systems and depot network.',
    },
    {
      customerIndex: 2,
      title: 'Electronic records system assessment',
      type: 'targeted' as const,
      date: '2026-10-05',
      status: 'in_progress' as const,
      patternIndex: 3,
      description: 'Targeted assessment; evidence collection is still underway.',
    },
  ];

  const scopeByCustomer = customers.map((c) => c.scope ?? '');
  const assessments = [];
  for (const spec of assessmentSpecs) {
    const evidence = (key: string, status: ControlStatus): string => {
      if (status === 'not_applicable') {
        return 'Not applicable to this environment; justification recorded by the assessor.';
      }
      if (status === 'not_assessed') return '';
      return `Evidence recorded during the walkthrough for ${key}: configuration sample and interview notes held by the assessor (demonstration record).`;
    };

    const assessment = await createAssessment(db, {
      customerId: customers[spec.customerIndex].id,
      title: spec.title,
      type: spec.type,
      scope: scopeByCustomer[spec.customerIndex],
      description: spec.description,
      assessmentDate: spec.date,
      assessor: 'Demo Assessor (OpenDefenders)',
      status: spec.status === 'completed' ? 'in_progress' : spec.status,
      methodologyVersion: CURRENT_METHODOLOGY_VERSION,
      coverageThreshold: settings.coverageThreshold,
      createdBy: creator,
      isDemo: true,
      controlIds: controls.map((c) => c.id),
    });

    const pattern = patterns[spec.patternIndex].pattern;
    for (const control of controls) {
      const status = pattern[control.controlKey] ?? 'not_assessed';
      if (status === 'not_assessed') continue;
      await upsertControlAssessment(db, {
        assessmentId: assessment.id,
        controlId: control.id,
        status,
        justification:
          status === 'not_applicable'
            ? 'The control does not apply to the systems in scope for this assessment (demonstration justification).'
            : null,
        evidenceNotes: evidence(control.controlKey, status),
        evidenceRef: `DEMO-EV-${control.controlKey}`,
        userId: creator,
        rubric: settings.rubric,
      });
    }

    // Persist the cached coverage/provisional columns exactly as the API would.
    const seeded = (await getAssessment(db, assessment.id))!;
    const live = await computeScore(await buildScoreInput(db, seeded));
    await updateAssessment(db, assessment.id, {
      coveragePct: live.coveragePct,
      provisional: !live.eligible,
    });
    assessments.push((await getAssessment(db, assessment.id))!);
  }

  // Link the reassessment to the baseline so history comparisons are explicit.
  await updateAssessment(db, assessments[1].id, { previousAssessmentId: assessments[0].id });

  // --- Findings ----------------------------------------------------------
  const findingsSpec: SeedFinding[] = [
    {
      key: '',
      title: 'Critical vulnerabilities unpatched on internet-facing banking portal',
      description:
        'Vulnerability scanning identified critical issues on the customer internet banking portal that remained unpatched beyond the agreed remediation window.',
      severity: 'critical',
      asset: 'ibg-portal-01',
      component: 'Web application and reverse proxy',
      assessmentIndex: 0,
      customerIndex: 0,
      status: 'in_progress',
      targetDaysFromNow: -12,
      discovered: '2026-03-08',
      evidence: 'Scan export DEMO-SCAN-001 and confirmation by the application owner.',
      remediation: 'Apply vendor patches, restart services and re-scan to confirm closure.',
      exploitability: 'poc',
      exposure: 'internet',
      impact: 'high',
    },
    {
      key: '',
      title: 'Multi-factor authentication not enforced for remote access',
      description:
        'Remote access to the corporate network can be completed with a single password factor for a large part of the workforce.',
      severity: 'critical',
      asset: 'vpn-gateway',
      component: 'Remote access',
      assessmentIndex: 0,
      customerIndex: 0,
      status: 'pending_verification',
      targetDaysFromNow: 5,
      discovered: '2026-03-09',
      evidence: 'Authentication policy export and a test sign-in without a second factor.',
      remediation:
        'Enforce MFA for all remote access accounts and verify with a sample sign-in test.',
      exploitability: 'weaponized',
      exposure: 'internet',
      impact: 'high',
    },
    {
      key: '',
      title: 'Privileged accounts shared between administrators',
      description:
        'Three administrators share a single privileged account for the core banking database, so administrative actions cannot be attributed to an individual.',
      severity: 'high',
      asset: 'core-db-01',
      component: 'Database administration',
      assessmentIndex: 0,
      customerIndex: 0,
      status: 'open',
      targetDaysFromNow: -3,
      discovered: '2026-03-09',
      evidence: 'Interview record and database audit log showing a shared login name.',
      remediation: 'Issue named administrative accounts and enable individual audit trails.',
      exposure: 'internal',
      impact: 'high',
    },
    {
      key: '',
      title: 'Backup restoration has never been tested',
      description: 'Backups run nightly but no restoration test has been performed or documented.',
      severity: 'high',
      asset: 'backup-server',
      component: 'Backup and recovery',
      assessmentIndex: 0,
      customerIndex: 0,
      status: 'resolved',
      targetDaysFromNow: -20,
      discovered: '2026-03-09',
      evidence: 'Backup job history with no restore records.',
      remediation: 'Perform a documented restoration test into an isolated environment.',
      impact: 'medium',
    },
    {
      key: '',
      title: 'Warehouse management system exposed to the internet',
      description:
        'The warehouse management system administrative interface is reachable from the public internet without an access restriction.',
      severity: 'high',
      asset: 'wms-admin',
      component: 'Warehouse management system',
      assessmentIndex: 2,
      customerIndex: 1,
      status: 'open',
      targetDaysFromNow: -6,
      discovered: '2026-06-20',
      evidence: 'External service inventory dated 2026-06-19.',
      remediation: 'Restrict administrative access to the corporate network or a VPN path.',
      exposure: 'internet',
      impact: 'high',
      exploitability: 'public',
    },
    {
      key: '',
      title: 'Endpoint protection missing on warehouse handheld devices',
      description:
        'Fourteen handheld devices used for stock scanning have no protection agent installed.',
      severity: 'medium',
      asset: 'warehouse-handhelds',
      component: 'Mobile endpoints',
      assessmentIndex: 2,
      customerIndex: 1,
      status: 'in_progress',
      targetDaysFromNow: 14,
      discovered: '2026-06-21',
      evidence: 'Asset inventory compared with the protection console device list.',
      remediation: 'Deploy the agent to all handhelds and add them to the monitoring policy.',
      exposure: 'internal',
      impact: 'medium',
    },
    {
      key: '',
      title: 'Phishing simulation programme not in place',
      description:
        'No phishing simulation exercises are run, so staff reporting behaviour is unmeasured.',
      severity: 'medium',
      asset: 'organisation-wide',
      component: 'Security awareness',
      assessmentIndex: 0,
      customerIndex: 0,
      status: 'accepted_risk',
      targetDaysFromNow: 60,
      discovered: '2026-03-10',
      evidence: 'Interview with the HR lead; no simulation records exist.',
      remediation: 'Introduce quarterly simulations with targeted coaching for repeat failures.',
      impact: 'medium',
    },
    {
      key: '',
      title: 'Wireless network at head office uses WPA2-Personal',
      description:
        'The corporate wireless network uses a shared passphrase instead of an enterprise authentication method.',
      severity: 'low',
      asset: 'hq-wifi',
      component: 'Wireless network',
      assessmentIndex: 1,
      customerIndex: 0,
      status: 'false_positive',
      targetDaysFromNow: 30,
      discovered: '2026-09-14',
      evidence: 'Wireless configuration export.',
      remediation: 'Move to WPA2-Enterprise with certificate-based authentication.',
      exposure: 'internal',
      impact: 'low',
    },
    {
      key: '',
      title: 'Incident response contact list out of date',
      description: 'The escalation list in the incident response plan still contains two leavers.',
      severity: 'low',
      asset: 'ir-plan',
      component: 'Incident response',
      assessmentIndex: 1,
      customerIndex: 0,
      status: 'open',
      targetDaysFromNow: 9,
      discovered: '2026-09-15',
      evidence: 'Document review of the current incident response plan.',
      remediation: 'Update the contact list and confirm the change with the incident manager.',
    },
    {
      key: '',
      title: 'Imaging storage retains scans longer than the retention policy',
      description:
        'Medical images are retained for seven years by default although policy specifies five years for non-clinical copies.',
      severity: 'informational',
      asset: 'pacs-archive',
      component: 'Medical imaging storage',
      assessmentIndex: 3,
      customerIndex: 2,
      status: 'open',
      targetDaysFromNow: 45,
      discovered: '2026-10-06',
      evidence: 'Storage lifecycle configuration review.',
      remediation: 'Align the storage lifecycle rule with the approved retention schedule.',
    },
  ];

  const createdFindings = [];
  for (const spec of findingsSpec) {
    const customer = customers[spec.customerIndex];
    const assessment =
      spec.assessmentIndex !== undefined ? assessments[spec.assessmentIndex] : null;
    const factors = priorityFactorsFrom({
      severity: spec.severity,
      exploitability: spec.exploitability ?? 'unknown',
      exposure: spec.exposure ?? 'unknown',
      businessImpact: spec.impact ?? 'unknown',
      compensatingControls: null,
    });
    const suggested = calculatePriority(factors);
    const targetDate =
      spec.targetDaysFromNow !== undefined
        ? addDays(nowIso().slice(0, 10), spec.targetDaysFromNow)
        : null;

    const finding = await createFinding(db, {
      customerId: customer.id,
      assessmentId: assessment?.id ?? null,
      title: spec.title,
      description: spec.description,
      asset: spec.asset,
      component: spec.component ?? null,
      severity: spec.severity,
      priority: suggested.priority,
      prioritySource: 'calculated',
      exploitability: factors.exploitability,
      exposure: factors.exposure,
      businessImpact: factors.businessImpact,
      compensatingControls: null,
      evidence: spec.evidence ?? null,
      discoveredDate: spec.discovered,
      assigneeId: creator,
      recommendedRemediation: spec.remediation,
      targetDate,
      externalRef: spec.externalRef ?? null,
      createdBy: creator,
      isDemo: true,
    });

    // Walk the status machine so each demo finding has a realistic history.
    if (
      spec.status === 'in_progress' ||
      spec.status === 'pending_verification' ||
      spec.status === 'resolved'
    ) {
      await changeFindingStatus(db, finding.id, {
        status: 'in_progress',
        note: 'Remediation started by the assigned owner.',
        changedBy: creator,
      });
    }
    if (spec.status === 'pending_verification' || spec.status === 'resolved') {
      await changeFindingStatus(db, finding.id, {
        status: 'pending_verification',
        note: 'Proposed fix submitted for independent verification.',
        changedBy: creator,
      });
    }
    if (spec.status === 'resolved') {
      await changeFindingStatus(db, finding.id, {
        status: 'resolved',
        note: 'Fix verified during a follow-up check.',
        resolutionNotes:
          'Patch applied and the control re-tested successfully (demonstration record).',
        verificationEvidence:
          'Re-scan output DEMO-VERIFY-001 shows the issue no longer reproduces.',
        changedBy: creator,
      });
    }
    if (spec.status === 'accepted_risk') {
      await changeFindingStatus(db, finding.id, {
        status: 'accepted_risk',
        note: 'Risk formally accepted for this reporting period.',
        riskJustification:
          'Simulations are deferred until the awareness programme is funded next quarter (demonstration justification).',
        riskDecisionMaker: 'Demo Risk Committee',
        riskReviewDate: addDays(nowIso().slice(0, 10), 90),
        changedBy: creator,
      });
    }
    if (spec.status === 'false_positive') {
      await changeFindingStatus(db, finding.id, {
        status: 'false_positive',
        note: 'Configuration review confirmed the network is managed by the building operator (demonstration justification).',
        changedBy: creator,
      });
    }
    if (spec.status === 'in_progress') {
      await addActivity(db, {
        findingId: finding.id,
        body: 'Owner confirmed the change window and is preparing the fix (demonstration note).',
        authorId: creator,
      });
    }
    createdFindings.push(finding);
  }

  // Freeze the two completed comparable assessments.
  await completeAssessment(db, assessments[0].id, users[0] ?? null);
  await completeAssessment(db, assessments[1].id, users[0] ?? null);
  await completeAssessment(db, assessments[2].id, users[0] ?? null);

  await recordAudit(db, {
    actorId: creator,
    actorEmail: users[0]?.email ?? null,
    action: 'demo.seeded',
    entityType: 'customer',
    entityId: null,
    summary: `Loaded demonstration data: ${customers.length} customers, ${assessments.length} assessments, ${createdFindings.length} findings`,
  });

  return {
    customers: customers.length,
    assessments: assessments.length,
    findings: createdFindings.length,
    replaced: Boolean(opts.replace),
  };
}
