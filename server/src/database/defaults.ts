import type { Db } from './db';
import { newId, nowIso } from '../utils/time';

interface SeedControl {
  key: string;
  name: string;
  description: string;
  guidance: string;
  rubric: string;
  applicability: string;
  evidence: string;
  weight: number;
}

interface SeedCategory {
  key: string;
  name: string;
  description: string;
  weight: number;
  sortOrder: number;
  controls: SeedControl[];
}

/**
 * Default configuration: six weighted security categories and their control
 * library. This is a starting framework, not a claim of compliance with any
 * certification or security standard. It is inserted idempotently on startup,
 * so administrators can edit controls without the application overwriting them.
 */
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  {
    key: 'vulnerability_management',
    name: 'Vulnerability Management',
    description:
      'How reliably the organisation finds, prioritises and fixes weaknesses in its systems.',
    weight: 25,
    sortOrder: 1,
    controls: [
      {
        key: 'VM-01',
        name: 'Vulnerability scanning coverage',
        description: 'Known systems are scanned on a defined schedule and results are reviewed.',
        guidance:
          'Confirm which assets are scanned, how often scanning runs, and whether new assets are picked up automatically.',
        rubric:
          'Effective: all in-scope assets scanned at least monthly with reviewed results. Partially: most assets scanned or results not consistently reviewed. Ineffective: no recurring scan or major asset groups excluded without justification.',
        applicability:
          'Applies where the organisation operates networked systems that can be scanned.',
        evidence: 'Scan schedule, asset coverage report, most recent scan output and review notes.',
        weight: 25,
      },
      {
        key: 'VM-02',
        name: 'Critical vulnerability remediation',
        description: 'Critical vulnerabilities are remediated within an agreed timeframe.',
        guidance:
          'Check the remediation service level, the current backlog of critical issues and how exceptions are approved.',
        rubric:
          'Effective: critical issues closed within the agreed service level with tracking evidence. Partially: service level defined but missed regularly. Ineffective: no service level or open critical issues with no plan.',
        applicability: 'Applies whenever vulnerabilities are identified by any means.',
        evidence: 'Remediation SLA, ticket history for critical issues, exception approvals.',
        weight: 30,
      },
      {
        key: 'VM-03',
        name: 'Patch management',
        description: 'Operating systems and third-party software are patched consistently.',
        guidance:
          'Review patch cycles, deployment tooling, coverage statistics and handling of out-of-band patches.',
        rubric:
          'Effective: documented cycles with automated deployment and compliance reporting. Partially: patches applied but manually or inconsistently. Ineffective: no patch process or critical systems unpatched.',
        applicability: 'Applies to all managed endpoints and servers.',
        evidence: 'Patch policy, compliance report, exception list.',
        weight: 25,
      },
      {
        key: 'VM-04',
        name: 'Recurring vulnerability reviews',
        description:
          'Vulnerability risk is reviewed regularly, including supply-chain and configuration weaknesses.',
        guidance:
          'Look for a recurring review forum, tracked actions and follow-up on previous findings.',
        rubric:
          'Effective: scheduled reviews with minutes and tracked actions. Partially: ad-hoc reviews. Ineffective: no recurring review.',
        applicability: 'Applies to organisations with any recurring technology risk.',
        evidence: 'Review minutes, action tracker, previous recommendations.',
        weight: 20,
      },
    ],
  },
  {
    key: 'identity_access',
    name: 'Identity and Access Management',
    description: 'How identities are proved, least privilege is enforced and access is reviewed.',
    weight: 20,
    sortOrder: 2,
    controls: [
      {
        key: 'IAM-01',
        name: 'MFA enforcement',
        description:
          'Multi-factor authentication is required for remote, privileged and high-risk access.',
        guidance:
          'Verify where MFA is enforced, which accounts are exempt and how exemptions are approved.',
        rubric:
          'Effective: MFA enforced for all remote and privileged access with no unapproved exemptions. Partially: MFA enabled but not enforced everywhere. Ineffective: MFA unavailable or not required.',
        applicability:
          'Applies where users authenticate to systems; consider applicability for kiosk or service accounts.',
        evidence: 'MFA policy, configuration screenshot or export, exemption register.',
        weight: 30,
      },
      {
        key: 'IAM-02',
        name: 'Least-privilege access',
        description: 'Users hold only the permissions required for their role.',
        guidance:
          'Sample user accounts across administrative and standard roles and compare against job requirements.',
        rubric:
          'Effective: role-based access with periodic recertification. Partially: roles exist but drift is evident. Ineffective: widespread standing administrative rights.',
        applicability: 'Applies to any environment with multiple user accounts.',
        evidence:
          'Role definitions, permission export for sampled accounts, recertification records.',
        weight: 25,
      },
      {
        key: 'IAM-03',
        name: 'Privileged account management',
        description: 'Privileged accounts are inventoried, protected and monitored.',
        guidance:
          'Check for a privileged account inventory, vaulting or credential rotation, and logging of privileged activity.',
        rubric:
          'Effective: inventoried, protected credentials and monitored use. Partially: known but inconsistently protected. Ineffective: unmanaged or shared privileged accounts.',
        applicability: 'Applies wherever administrative accounts exist.',
        evidence: 'Privileged account inventory, vault configuration, administrative logs.',
        weight: 25,
      },
      {
        key: 'IAM-04',
        name: 'Account lifecycle and access reviews',
        description:
          'Joiner, mover and leaver processes remove access promptly and access is reviewed.',
        guidance:
          'Compare recent leavers against active accounts and inspect the periodic access review evidence.',
        rubric:
          'Effective: automated or enforced lifecycle with documented reviews. Partially: process exists but evidence is incomplete. Ineffective: stale accounts remain active.',
        applicability: 'Applies where staff or contractors are given accounts.',
        evidence: 'Joiner/mover/leaver procedure, deprovisioning tickets, access review records.',
        weight: 20,
      },
    ],
  },
  {
    key: 'endpoint_security',
    name: 'Endpoint Security',
    description: 'How endpoints are protected, monitored, patched and hardened.',
    weight: 20,
    sortOrder: 3,
    controls: [
      {
        key: 'EP-01',
        name: 'Endpoint protection coverage',
        description: 'All managed endpoints run approved protection tooling.',
        guidance:
          'Reconcile the asset inventory against endpoints reporting to the protection platform.',
        rubric:
          'Effective: >=98% of known endpoints reporting. Partially: 80-97% or gaps in specific groups. Ineffective: <80% or no protection platform.',
        applicability: 'Applies where endpoints or servers are managed by the organisation.',
        evidence: 'Asset inventory, protection console coverage report.',
        weight: 30,
      },
      {
        key: 'EP-02',
        name: 'Endpoint monitoring',
        description: 'Endpoint telemetry is collected and reviewed for suspicious activity.',
        guidance: 'Check what telemetry is collected, retention periods and who reviews alerts.',
        rubric:
          'Effective: central logging with alerting and a defined review process. Partially: logging without reliable review. Ineffective: no endpoint telemetry.',
        applicability: 'Applies where endpoints process organisational data.',
        evidence: 'Log source list, alert examples, review schedule.',
        weight: 25,
      },
      {
        key: 'EP-03',
        name: 'Security update management',
        description: 'Security-critical software on endpoints is kept current.',
        guidance: 'Sample endpoints for browser, office suite and firmware update currency.',
        rubric:
          'Effective: automated updates enforced with compliance reporting. Partially: updates applied manually. Ineffective: updates missing on sampled endpoints.',
        applicability: 'Applies to all managed endpoints.',
        evidence: 'Update compliance report, sample endpoint versions.',
        weight: 25,
      },
      {
        key: 'EP-04',
        name: 'Endpoint configuration hardening',
        description: 'Endpoints follow a hardened, centrally enforced configuration baseline.',
        guidance:
          'Compare a sample of endpoints against the documented baseline or CIS-style benchmarks.',
        rubric:
          'Effective: enforced baseline with deviation reporting. Partially: baseline documented but not enforced. Ineffective: no baseline.',
        applicability: 'Applies where configuration can be centrally managed.',
        evidence: 'Baseline document, policy enforcement report, sample configurations.',
        weight: 20,
      },
    ],
  },
  {
    key: 'cloud_network',
    name: 'Cloud and Network Security',
    description: 'How network boundaries, firewall rules and cloud configuration are controlled.',
    weight: 15,
    sortOrder: 4,
    controls: [
      {
        key: 'CN-01',
        name: 'Network segmentation and exposure controls',
        description: 'Networks are segmented and internet exposure is deliberate and limited.',
        guidance:
          'Review network diagrams, segmentation between zones and the list of internet-facing services.',
        rubric:
          'Effective: documented segmentation with reviewed exposure. Partially: segmentation exists but undocumented or uneven. Ineffective: flat network or unmanaged exposure.',
        applicability:
          'Applies where the organisation operates or uses a network. Mark not applicable for fully serverless single-service deployments without network control.',
        evidence: 'Network diagram, exposure inventory, segmentation test results.',
        weight: 30,
      },
      {
        key: 'CN-02',
        name: 'Firewall configuration review',
        description: 'Firewall and security-group rules are reviewed and change controlled.',
        guidance:
          'Inspect rule sets for broad rules, unused entries and evidence of periodic recertification.',
        rubric:
          'Effective: documented periodic review with clean rule sets. Partially: review performed without records. Ineffective: no review or permissive rules in place.',
        applicability: 'Applies wherever firewalls or cloud security groups are used.',
        evidence: 'Rule export, review record, change tickets.',
        weight: 30,
      },
      {
        key: 'CN-03',
        name: 'Cloud identity and access controls',
        description:
          'Cloud platform access uses strong authentication, least privilege and logging.',
        guidance:
          'Check cloud IAM policies, root or owner account protection and audit logging. Mark not applicable if no cloud services are used.',
        rubric:
          'Effective: enforced MFA, least-privilege roles and enabled audit logs. Partially: some controls present. Ineffective: shared or unprotected owner accounts.',
        applicability:
          'Only applicable where cloud services are in scope; justify if not applicable.',
        evidence: 'IAM policy export, MFA report, audit log configuration.',
        weight: 20,
      },
      {
        key: 'CN-04',
        name: 'Secure configuration management',
        description:
          'System and service configurations are baselined, changed under control and checked.',
        guidance: 'Look for configuration baselines, change tickets and drift detection.',
        rubric:
          'Effective: baselines with change control and drift checks. Partially: baselines without enforcement. Ineffective: undocumented configuration changes.',
        applicability: 'Applies to systems whose configuration affects security.',
        evidence: 'Baseline documents, change records, drift report.',
        weight: 20,
      },
    ],
  },
  {
    key: 'security_awareness',
    name: 'Security Awareness',
    description: 'How well staff recognise and report security threats.',
    weight: 10,
    sortOrder: 5,
    controls: [
      {
        key: 'SA-01',
        name: 'Security awareness training coverage',
        description: 'Staff complete security awareness training on a regular basis.',
        guidance: 'Check completion rates, onboarding coverage and refresh frequency.',
        rubric:
          'Effective: >=95% completion with annual refresh. Partially: training offered but completion below 95%. Ineffective: no programme.',
        applicability:
          'Applies where the organisation has staff; justify if a single-person entity.',
        evidence: 'Completion report, training materials, onboarding checklist.',
        weight: 40,
      },
      {
        key: 'SA-02',
        name: 'Phishing awareness exercises',
        description: 'Simulated phishing exercises are run and failures receive targeted coaching.',
        guidance:
          'Review simulation results and follow-up actions. Mark not applicable where simulations are prohibited.',
        rubric:
          'Effective: regular simulations with tracked coaching. Partially: occasional simulations. Ineffective: none or no follow-up.',
        applicability: 'Where applicable; document if exercises are not permitted by policy.',
        evidence: 'Simulation reports, coaching records.',
        weight: 35,
      },
      {
        key: 'SA-03',
        name: 'Employee incident-reporting awareness',
        description: 'Staff know how and when to report security incidents.',
        guidance: 'Test awareness of the reporting route and check for published guidance.',
        rubric:
          'Effective: published route with demonstrated staff awareness. Partially: route exists but awareness is low. Ineffective: no reporting route.',
        applicability: 'Applies where staff use organisational systems.',
        evidence: 'Awareness communications, helpdesk examples, survey results.',
        weight: 25,
      },
    ],
  },
  {
    key: 'incident_response',
    name: 'Incident Response and Backup Readiness',
    description: 'How the organisation responds to incidents and recovers data.',
    weight: 10,
    sortOrder: 6,
    controls: [
      {
        key: 'IR-01',
        name: 'Documented incident response procedures',
        description:
          'A current incident response plan defines roles, escalation and communication.',
        guidance: 'Review the plan, its review history and the contact list.',
        rubric:
          'Effective: current documented plan with named roles. Partially: plan exists but outdated or incomplete. Ineffective: no plan.',
        applicability: 'Applies to all organisations in scope.',
        evidence: 'Incident response plan, review record, contact list.',
        weight: 30,
      },
      {
        key: 'IR-02',
        name: 'Incident response testing',
        description: 'Response procedures are exercised and improved.',
        guidance: 'Look for tabletop or technical exercise records and resulting actions.',
        rubric:
          'Effective: exercises at least annually with tracked actions. Partially: informal discussion only. Ineffective: never tested.',
        applicability: 'Applies where an incident response plan exists or is required.',
        evidence: 'Exercise schedule, scenario notes, lessons-learned actions.',
        weight: 25,
      },
      {
        key: 'IR-03',
        name: 'Backup coverage',
        description: 'Critical data and systems are backed up to a defined standard.',
        guidance: 'Check backup scope, frequency, retention and off-site or isolated copies.',
        rubric:
          'Effective: documented scope with automated, monitored backups including an isolated copy. Partially: backups exist without full coverage or monitoring. Ineffective: no reliable backups.',
        applicability: 'Applies where data or systems must be recoverable.',
        evidence: 'Backup policy, job history, storage configuration.',
        weight: 25,
      },
      {
        key: 'IR-04',
        name: 'Backup restoration testing',
        description: 'Restores are tested and the results documented.',
        guidance: 'Inspect recent restoration test records and any issues found.',
        rubric:
          'Effective: documented restoration tests at least quarterly. Partially: tests performed but not documented. Ineffective: never tested.',
        applicability: 'Applies where backups are relied upon for recovery.',
        evidence: 'Restoration test records, recovery metrics, remediation actions.',
        weight: 20,
      },
    ],
  },
];

export async function seedDefaultConfiguration(db: Db): Promise<void> {
  const existing = (await db.prepare('SELECT COUNT(*) AS c FROM security_categories').get<{
    c: string | number;
  }>()) ?? { c: 0 };
  if (Number(existing.c) > 0) return;

  const now = nowIso();
  const insertCategory = db.prepare(
    `INSERT INTO security_categories (id, category_key, name, description, weight, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const insertControl = db.prepare(
    `INSERT INTO security_controls (id, control_key, category_id, name, description, guidance, rubric, applicability, evidence_requirements, weight, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );

  await db.transaction(async () => {
    for (const cat of DEFAULT_CATEGORIES) {
      const catId = newId();
      await insertCategory.run(
        catId,
        cat.key,
        cat.name,
        cat.description,
        cat.weight,
        cat.sortOrder,
        now,
        now,
      );
      for (const ctrl of cat.controls) {
        await insertControl.run(
          newId(),
          ctrl.key,
          catId,
          ctrl.name,
          ctrl.description,
          ctrl.guidance,
          ctrl.rubric,
          ctrl.applicability,
          ctrl.evidence,
          ctrl.weight,
          now,
          now,
        );
      }
    }
    await db
      .prepare(
        `INSERT INTO scoring_methodologies (version, config_json, notes, created_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT (version) DO NOTHING`,
      )
      .run(
        JSON.stringify({
          categories: DEFAULT_CATEGORIES.map((c) => ({ key: c.key, weight: c.weight })),
          rubric: { effective: 100, partially_effective: 50, ineffective: 0 },
          coverageThreshold: 80,
        }),
        'Initial methodology: weighted category mean with coverage-based eligibility.',
        now,
      );
    await db
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO NOTHING`,
      )
      .run(
        'scoring',
        JSON.stringify({
          coverageThreshold: 80,
          rubric: { effective: 100, partially_effective: 50, ineffective: 0 },
        }),
        now,
      );
  })();
}
