/**
 * Shared constants, enumerations and default configuration used by both the
 * Express server and the React client. Keeping these in one place guarantees
 * the UI and the API always agree on the vocabulary of the system.
 */

export const APP_NAME = 'OpenDefenders Cybersecurity Management Platform';
export const APP_SHORT_NAME = 'ODCMP';
export const ORGANIZATION = 'OpenDefenders Technologies';

/** Default display timezone (project requirement: Africa/Lusaka). */
export const DEFAULT_TIMEZONE = 'Africa/Lusaka';

export const ROLES = ['admin', 'analyst', 'reviewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  analyst: 'Analyst',
  reviewer: 'Read-only reviewer',
};

export const CUSTOMER_STATUSES = ['active', 'archived'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const ASSESSMENT_STATUSES = ['draft', 'in_progress', 'completed', 'archived'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_TYPES = [
  'baseline',
  'periodic',
  'targeted',
  'reassessment',
  'gap_analysis',
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const CONTROL_STATUSES = [
  'effective',
  'partially_effective',
  'ineffective',
  'not_assessed',
  'not_applicable',
] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

/** Default scoring rubric. Values are illustrative defaults and are versioned. */
export const DEFAULT_RUBRIC: Record<ControlStatus, number | null> = {
  effective: 100,
  partially_effective: 50,
  ineffective: 0,
  not_assessed: null,
  not_applicable: null,
};

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
};

export const FINDING_STATUSES = [
  'open',
  'in_progress',
  'pending_verification',
  'resolved',
  'accepted_risk',
  'false_positive',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Terminal/closed statuses are excluded from "open" dashboards. */
export const CLOSED_FINDING_STATUSES: FindingStatus[] = ['resolved', 'false_positive'];

/** Allowed status transitions (documented in docs/user-guide.md). */
export const FINDING_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  open: ['in_progress', 'pending_verification', 'accepted_risk', 'false_positive'],
  in_progress: ['pending_verification', 'open', 'accepted_risk', 'false_positive'],
  pending_verification: ['resolved', 'in_progress', 'open', 'accepted_risk'],
  resolved: ['in_progress'],
  accepted_risk: ['open'],
  false_positive: ['open'],
};

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: 'P1 – Immediate',
  P2: 'P2 – Urgent',
  P3: 'P3 – Scheduled',
  P4: 'P4 – Planned',
};

export const PRIORITY_SOURCES = ['calculated', 'manual'] as const;
export type PrioritySource = (typeof PRIORITY_SOURCES)[number];

export const EXPLOITABILITY = [
  'unknown',
  'weaponized',
  'poc',
  'public',
  'not_exploitable',
] as const;
export type Exploitability = (typeof EXPLOITABILITY)[number];

export const EXPOSURE = ['unknown', 'internet', 'internal', 'restricted'] as const;
export type Exposure = (typeof EXPOSURE)[number];

export const BUSINESS_IMPACT = ['unknown', 'high', 'medium', 'low'] as const;
export type BusinessImpact = (typeof BUSINESS_IMPACT)[number];

export const REPORT_TYPES = ['executive', 'technical', 'remediation'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const SERVICE_REQUEST_STATUSES = ['new', 'contacted', 'in_progress', 'closed'] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  executive: 'Executive Cybersecurity Assessment Report',
  technical: 'Technical Findings Report',
  remediation: 'Vulnerability Remediation Status Report',
};

/** Default category weights (must total 100). */
export const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  vulnerability_management: 25,
  identity_access: 20,
  endpoint_security: 20,
  cloud_network: 15,
  security_awareness: 10,
  incident_response: 10,
};

export const DEFAULT_COVERAGE_THRESHOLD = 80;

/** Current scoring methodology version. Historical snapshots keep their version. */
export const CURRENT_METHODOLOGY_VERSION = 1;

export const SCORE_BANDS: {
  min: number;
  label: string;
  tone: 'critical' | 'high' | 'medium' | 'low';
}[] = [
  { min: 90, label: 'Strong', tone: 'low' },
  { min: 75, label: 'Good', tone: 'medium' },
  { min: 55, label: 'Needs improvement', tone: 'high' },
  { min: 0, label: 'At risk', tone: 'critical' },
];

export function scoreBand(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}
