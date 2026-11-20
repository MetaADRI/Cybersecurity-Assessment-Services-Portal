import type {
  AssessmentStatus,
  AssessmentType,
  BusinessImpact,
  ControlStatus,
  CustomerStatus,
  Exploitability,
  Exposure,
  FindingStatus,
  Priority,
  PrioritySource,
  ReportType,
  Role,
  Severity,
} from './constants.js';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  description: string | null;
  industry: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  scope: string | null;
  status: CustomerStatus;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface Category {
  id: string;
  categoryKey: string;
  name: string;
  description: string;
  weight: number;
  sortOrder: number;
  active: boolean;
}

export interface Control {
  id: string;
  controlKey: string;
  categoryId: string;
  categoryKey: string;
  categoryName: string;
  name: string;
  description: string;
  guidance: string;
  rubric: string;
  applicability: string;
  evidenceRequirements: string;
  weight: number;
  active: boolean;
}

export interface Assessment {
  id: string;
  assessmentKey: string;
  customerId: string;
  customerName?: string;
  title: string;
  type: AssessmentType;
  scope: string;
  description: string | null;
  assessmentDate: string;
  assessor: string;
  status: AssessmentStatus;
  methodologyVersion: number;
  coverageThreshold: number;
  coveragePct: number;
  provisional: boolean;
  overallScore: number | null;
  previousAssessmentId: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  createdBy: string | null;
}

export interface ControlAssessment {
  id: string;
  assessmentId: string;
  controlId: string;
  status: ControlStatus;
  score: number | null;
  justification: string | null;
  evidenceNotes: string | null;
  evidenceRef: string | null;
  assessedAt: string | null;
  assessedBy: string | null;
}

export interface Finding {
  id: string;
  findingKey: string;
  title: string;
  description: string;
  customerId: string;
  customerName?: string;
  assessmentId: string | null;
  assessmentTitle?: string | null;
  asset: string | null;
  component: string | null;
  severity: Severity;
  priority: Priority;
  prioritySource: PrioritySource;
  priorityJustification: string | null;
  exploitability: Exploitability;
  exposure: Exposure;
  businessImpact: BusinessImpact;
  compensatingControls: string | null;
  evidence: string | null;
  discoveredDate: string;
  assigneeId: string | null;
  assigneeName?: string | null;
  recommendedRemediation: string | null;
  status: FindingStatus;
  targetDate: string | null;
  resolutionNotes: string | null;
  verificationEvidence: string | null;
  resolvedAt: string | null;
  externalRef: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  overdue?: boolean;
}

export interface StatusHistoryEntry {
  id: string;
  findingId: string;
  fromStatus: FindingStatus | null;
  toStatus: FindingStatus;
  note: string | null;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
}

export interface RemediationActivity {
  id: string;
  findingId: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  reportKey: string;
  type: ReportType;
  title: string;
  customerId: string;
  customerName?: string;
  assessmentId: string | null;
  assessmentTitle?: string | null;
  fileName: string;
  fileSize: number;
  status: 'generated' | 'failed';
  errorMessage: string | null;
  snapshot: string | null;
  generatedAt: string;
  generatedBy: string | null;
  generatedByName?: string | null;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

/** Result of the deterministic scoring engine. */
export interface CategoryScore {
  categoryId: string;
  categoryKey: string;
  name: string;
  weight: number;
  score: number | null;
  applicableControls: number;
  assessedControls: number;
  unassessedControls: number;
  notApplicableControls: number;
  eligible: boolean;
}

export interface ScoreResult {
  overallScore: number | null;
  provisional: boolean;
  eligible: boolean;
  eligibilityReasons: string[];
  coveragePct: number;
  applicableControls: number;
  assessedControls: number;
  unassessedControls: number;
  notApplicableControls: number;
  totalControls: number;
  categories: CategoryScore[];
  excludedCategories: string[];
  methodologyVersion: number;
  computedAt: string;
  criticalOpenFindings: number;
  highOpenFindings: number;
}
