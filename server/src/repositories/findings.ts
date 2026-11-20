import type { Db } from '../database/db';
import { newId, nowIso, isOverdue } from '../utils/time';
import { nextSequence } from '../database/db';
import type { Finding, RemediationActivity, StatusHistoryEntry } from '../../../shared/types';
import type {
  BusinessImpact,
  Exploitability,
  Exposure,
  FindingStatus,
  Priority,
  PrioritySource,
  Severity,
} from '../../../shared/constants';
import { CLOSED_FINDING_STATUSES, FINDING_TRANSITIONS } from '../../../shared/constants';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

interface FindingRow {
  id: string;
  finding_key: string;
  title: string;
  description: string;
  customer_id: string;
  assessment_id: string | null;
  asset: string | null;
  component: string | null;
  severity: Severity;
  priority: Priority;
  priority_source: PrioritySource;
  priority_justification: string | null;
  exploitability: Exploitability;
  exposure: Exposure;
  business_impact: BusinessImpact;
  compensating_controls: string | null;
  evidence: string | null;
  discovered_date: string;
  assignee_id: string | null;
  recommended_remediation: string | null;
  status: FindingStatus;
  target_date: string | null;
  resolution_notes: string | null;
  verification_evidence: string | null;
  resolved_at: string | null;
  external_ref: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  customer_name?: string;
  assessment_title?: string | null;
  assignee_name?: string | null;
}

function mapFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    findingKey: row.finding_key,
    title: row.title,
    description: row.description,
    customerId: row.customer_id,
    customerName: row.customer_name,
    assessmentId: row.assessment_id,
    assessmentTitle: row.assessment_title ?? null,
    asset: row.asset,
    component: row.component,
    severity: row.severity,
    priority: row.priority,
    prioritySource: row.priority_source,
    priorityJustification: row.priority_justification,
    exploitability: row.exploitability,
    exposure: row.exposure,
    businessImpact: row.business_impact,
    compensatingControls: row.compensating_controls,
    evidence: row.evidence,
    discoveredDate: row.discovered_date,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name ?? null,
    recommendedRemediation: row.recommended_remediation,
    status: row.status,
    targetDate: row.target_date,
    resolutionNotes: row.resolution_notes,
    verificationEvidence: row.verification_evidence,
    resolvedAt: row.resolved_at,
    externalRef: row.external_ref,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    overdue:
      !CLOSED_FINDING_STATUSES.includes(row.status) &&
      row.status !== 'accepted_risk' &&
      isOverdue(row.target_date),
  };
}

const FINDING_SELECT = `
  SELECT f.*, c.name AS customer_name, a.title AS assessment_title, u.full_name AS assignee_name
  FROM findings f
  JOIN customers c ON c.id = f.customer_id
  LEFT JOIN assessments a ON a.id = f.assessment_id
  LEFT JOIN users u ON u.id = f.assignee_id`;

export interface ListFindingsOptions {
  page: number;
  pageSize: number;
  q?: string;
  customerId?: string;
  assessmentId?: string;
  severity?: Severity;
  status?: FindingStatus;
  assigneeId?: string;
  overdue?: boolean;
  dir: 'asc' | 'desc';
  sort?: string;
}

const SORTABLE: Record<string, string> = {
  severity: `CASE f.severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END`,
  priority: `CASE f.priority WHEN 'P1' THEN 4 WHEN 'P2' THEN 3 WHEN 'P3' THEN 2 ELSE 1 END`,
  discoveredDate: 'f.discovered_date',
  targetDate: 'f.target_date',
  status: 'f.status',
  createdAt: 'f.created_at',
  title: 'f.title',
  findingKey: 'f.finding_key',
};

export async function listFindings(
  db: Db,
  opts: ListFindingsOptions,
): Promise<{ items: Finding[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.q) {
    where.push(
      `(lower(f.title) LIKE ? OR lower(f.finding_key) LIKE ? OR lower(COALESCE(f.asset,'')) LIKE ? OR lower(COALESCE(f.external_ref,'')) LIKE ?)`,
    );
    const like = `%${opts.q.toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  if (opts.customerId) {
    where.push('f.customer_id = ?');
    params.push(opts.customerId);
  }
  if (opts.assessmentId) {
    where.push('f.assessment_id = ?');
    params.push(opts.assessmentId);
  }
  if (opts.severity) {
    where.push('f.severity = ?');
    params.push(opts.severity);
  }
  if (opts.status) {
    where.push('f.status = ?');
    params.push(opts.status);
  }
  if (opts.assigneeId) {
    where.push('f.assignee_id = ?');
    params.push(opts.assigneeId);
  }
  if (opts.overdue) {
    where.push(
      `f.target_date IS NOT NULL AND f.target_date < ? AND f.status NOT IN ('resolved','false_positive','accepted_risk')`,
    );
    params.push(nowIso().slice(0, 10));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(
    (await db
      .prepare(`SELECT COUNT(*) AS c FROM findings f ${clause}`)
      .get<{ c: number | string }>(...params))!.c,
  );
  const sortExpr = SORTABLE[opts.sort ?? 'severity'] ?? SORTABLE.severity;
  const dir = opts.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = await db
    .prepare(
      `${FINDING_SELECT} ${clause} ORDER BY ${sortExpr} ${dir}, f.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all<FindingRow>(...params, opts.pageSize, (opts.page - 1) * opts.pageSize);
  return { items: rows.map(mapFinding), total };
}

export async function getFinding(db: Db, id: string): Promise<Finding | null> {
  const row = await db
    .prepare(`${FINDING_SELECT} WHERE f.id = ? OR f.finding_key = ?`)
    .get<FindingRow>(id, id);
  return row ? mapFinding(row) : null;
}

export async function requireFinding(db: Db, id: string): Promise<Finding> {
  const finding = await getFinding(db, id);
  if (!finding) throw new NotFoundError('Finding not found');
  return finding;
}

export interface CreateFindingInput {
  customerId: string;
  assessmentId?: string | null;
  title: string;
  description: string;
  asset?: string | null;
  component?: string | null;
  severity: Severity;
  priority: Priority;
  prioritySource: PrioritySource;
  priorityJustification?: string | null;
  exploitability: Exploitability;
  exposure: Exposure;
  businessImpact: BusinessImpact;
  compensatingControls?: string | null;
  evidence?: string | null;
  discoveredDate: string;
  assigneeId?: string | null;
  recommendedRemediation?: string | null;
  targetDate?: string | null;
  externalRef?: string | null;
  createdBy: string | null;
  isDemo?: boolean;
}

export async function createFinding(db: Db, input: CreateFindingInput): Promise<Finding> {
  const id = newId();
  const now = nowIso();
  const tx = db.transaction(async () => {
    const key = await nextSequence(db, 'finding', 'FND');
    await db
      .prepare(
        `INSERT INTO findings (id, finding_key, title, description, customer_id, assessment_id, asset, component, severity, priority,
          priority_source, priority_justification, exploitability, exposure, business_impact, compensating_controls, evidence,
          discovered_date, assignee_id, recommended_remediation, status, target_date, resolution_notes, verification_evidence,
          resolved_at, external_ref, is_demo, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        key,
        input.title,
        input.description,
        input.customerId,
        input.assessmentId ?? null,
        input.asset || null,
        input.component || null,
        input.severity,
        input.priority,
        input.prioritySource,
        input.priorityJustification || null,
        input.exploitability,
        input.exposure,
        input.businessImpact,
        input.compensatingControls || null,
        input.evidence || null,
        input.discoveredDate,
        input.assigneeId ?? null,
        input.recommendedRemediation || null,
        input.targetDate || null,
        input.externalRef || null,
        input.isDemo ? 1 : 0,
        now,
        now,
        input.createdBy,
      );
    await insertHistory(db, {
      findingId: id,
      fromStatus: null,
      toStatus: 'open',
      note: 'Finding created',
      changedBy: input.createdBy,
    });
    if (input.assigneeId) {
      await insertHistory(db, {
        findingId: id,
        fromStatus: null,
        toStatus: 'open',
        note: 'Assigned on creation',
        changedBy: input.createdBy,
      });
    }
  });
  await tx();
  return await requireFinding(db, id);
}

async function insertHistory(
  db: Db,
  input: {
    findingId: string;
    fromStatus: FindingStatus | null;
    toStatus: FindingStatus;
    note?: string | null;
    changedBy: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO finding_status_history (id, finding_id, from_status, to_status, note, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.findingId,
      input.fromStatus,
      input.toStatus,
      input.note || null,
      input.changedBy,
      nowIso(),
    );
}

export async function updateFinding(
  db: Db,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
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
    recommendedRemediation: string | null;
    targetDate: string | null;
    externalRef: string | null;
    assessmentId: string | null;
    resolutionNotes: string | null;
    verificationEvidence: string | null;
  }>,
): Promise<Finding> {
  const existing = await requireFinding(db, id);
  const columns: Record<string, string> = {
    title: 'title',
    description: 'description',
    asset: 'asset',
    component: 'component',
    severity: 'severity',
    priority: 'priority',
    prioritySource: 'priority_source',
    priorityJustification: 'priority_justification',
    exploitability: 'exploitability',
    exposure: 'exposure',
    businessImpact: 'business_impact',
    compensatingControls: 'compensating_controls',
    evidence: 'evidence',
    discoveredDate: 'discovered_date',
    assigneeId: 'assignee_id',
    recommendedRemediation: 'recommended_remediation',
    targetDate: 'target_date',
    externalRef: 'external_ref',
    assessmentId: 'assessment_id',
    resolutionNotes: 'resolution_notes',
    verificationEvidence: 'verification_evidence',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      params.push(value === '' ? null : value);
    }
  }
  if (sets.length === 0) return existing;
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.prepare(`UPDATE findings SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return await requireFinding(db, id);
}

export interface StatusChangeInput {
  status: FindingStatus;
  note?: string | null;
  resolutionNotes?: string | null;
  verificationEvidence?: string | null;
  riskJustification?: string | null;
  riskDecisionMaker?: string | null;
  riskReviewDate?: string | null;
  changedBy: string | null;
}

/**
 * Apply a status transition with server-side rules:
 *  - the transition must be allowed by the documented state machine
 *  - resolving requires resolution notes or verification evidence
 *  - risk acceptance requires a justification and a decision maker
 *  - false positive requires a documented explanation
 * Status history and the risk acceptance record are written in one transaction.
 */
export async function changeFindingStatus(
  db: Db,
  findingId: string,
  input: StatusChangeInput,
): Promise<Finding> {
  const finding = await requireFinding(db, findingId);
  if (finding.status === input.status) {
    throw new ConflictError(`Finding is already "${input.status}"`);
  }
  const allowed = FINDING_TRANSITIONS[finding.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw new ValidationError(
      `Status change from "${finding.status}" to "${input.status}" is not allowed`,
      { allowed },
    );
  }

  if (input.status === 'resolved') {
    const notes = (input.resolutionNotes ?? finding.resolutionNotes ?? '').trim();
    const evidence = (input.verificationEvidence ?? finding.verificationEvidence ?? '').trim();
    if (!notes && !evidence) {
      throw new ValidationError(
        'Resolution notes or verification evidence are required to resolve a finding',
        {
          field: 'resolutionNotes',
        },
      );
    }
  }
  if (input.status === 'accepted_risk') {
    if (!input.riskJustification?.trim()) {
      throw new ValidationError('A justification is required to accept a risk', {
        field: 'riskJustification',
      });
    }
    if (!input.riskDecisionMaker?.trim()) {
      throw new ValidationError('An authorised decision maker is required to accept a risk', {
        field: 'riskDecisionMaker',
      });
    }
  }
  if (input.status === 'false_positive') {
    if (!input.note?.trim()) {
      throw new ValidationError(
        'A documented explanation is required to mark a finding as a false positive',
        {
          field: 'note',
        },
      );
    }
  }

  const now = nowIso();
  const tx = db.transaction(async () => {
    const resolvedAt = input.status === 'resolved' ? now : null;
    await db
      .prepare(
        `UPDATE findings SET status = ?, resolution_notes = COALESCE(?, resolution_notes),
          verification_evidence = COALESCE(?, verification_evidence), resolved_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.status,
        input.resolutionNotes || null,
        input.verificationEvidence || null,
        resolvedAt,
        now,
        findingId,
      );
    await insertHistory(db, {
      findingId,
      fromStatus: finding.status,
      toStatus: input.status,
      note: input.note || null,
      changedBy: input.changedBy,
    });
    if (input.status === 'accepted_risk') {
      await db
        .prepare(
          `INSERT INTO risk_acceptances (id, finding_id, justification, decision_maker, approved_at, review_date, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          findingId,
          input.riskJustification!.trim(),
          input.riskDecisionMaker!.trim(),
          now,
          input.riskReviewDate || null,
          input.changedBy,
        );
    }
  });
  await tx();
  return await requireFinding(db, findingId);
}

export async function listHistory(db: Db, findingId: string): Promise<StatusHistoryEntry[]> {
  const rows = await db
    .prepare(
      `SELECT h.*, u.full_name AS changed_by_name FROM finding_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.finding_id = ? ORDER BY h.changed_at ASC, h.id ASC`,
    )
    .all<Record<string, unknown>>(findingId);
  return rows.map((r) => ({
    id: r.id as string,
    findingId: r.finding_id as string,
    fromStatus: (r.from_status as FindingStatus | null) ?? null,
    toStatus: r.to_status as FindingStatus,
    note: (r.note as string | null) ?? null,
    changedBy: (r.changed_by as string | null) ?? null,
    changedByName: (r.changed_by_name as string | null) ?? null,
    changedAt: r.changed_at as string,
  }));
}

export async function listActivities(db: Db, findingId: string): Promise<RemediationActivity[]> {
  const rows = await db
    .prepare(
      `SELECT a.*, u.full_name AS author_name FROM remediation_activities a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.finding_id = ? ORDER BY a.created_at DESC`,
    )
    .all<Record<string, unknown>>(findingId);
  return rows.map((r) => ({
    id: r.id as string,
    findingId: r.finding_id as string,
    body: r.body as string,
    authorId: (r.author_id as string | null) ?? null,
    authorName: (r.author_name as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function addActivity(
  db: Db,
  input: { findingId: string; body: string; authorId: string | null },
): Promise<RemediationActivity> {
  await requireFinding(db, input.findingId);
  const id = newId();
  await db
    .prepare(
      'INSERT INTO remediation_activities (id, finding_id, body, author_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, input.findingId, input.body, input.authorId, nowIso());
  const rows = await listActivities(db, input.findingId);
  const created = rows.find((a) => a.id === id);
  if (!created) throw new NotFoundError('Activity not found after creation');
  return created;
}

export interface FindingCounts {
  total: number;
  open: number;
  criticalOpen: number;
  highOpen: number;
  inProgress: number;
  pendingVerification: number;
  overdue: number;
  resolved: number;
  acceptedRisk: number;
  falsePositive: number;
}

export async function findingCounts(db: Db, customerId?: string): Promise<FindingCounts> {
  const params: unknown[] = [];
  let scope = '';
  if (customerId) {
    scope = 'WHERE customer_id = ?';
    params.push(customerId);
  }
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('open','in_progress','pending_verification') THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN severity = 'critical' AND status IN ('open','in_progress','pending_verification') THEN 1 ELSE 0 END) AS critical_open,
        SUM(CASE WHEN severity = 'high' AND status IN ('open','in_progress','pending_verification') THEN 1 ELSE 0 END) AS high_open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending_verification,
        SUM(CASE WHEN target_date IS NOT NULL AND target_date < ? AND status IN ('open','in_progress','pending_verification') THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'accepted_risk' THEN 1 ELSE 0 END) AS accepted_risk,
        SUM(CASE WHEN status = 'false_positive' THEN 1 ELSE 0 END) AS false_positive
       FROM findings ${scope}`,
    )
    .get<Record<string, string | number | null>>(nowIso().slice(0, 10), ...params);

  return {
    total: Number(row!.total ?? 0),
    open: Number(row!.open_count ?? 0),
    criticalOpen: Number(row!.critical_open ?? 0),
    highOpen: Number(row!.high_open ?? 0),
    inProgress: Number(row!.in_progress ?? 0),
    pendingVerification: Number(row!.pending_verification ?? 0),
    overdue: Number(row!.overdue ?? 0),
    resolved: Number(row!.resolved ?? 0),
    acceptedRisk: Number(row!.accepted_risk ?? 0),
    falsePositive: Number(row!.false_positive ?? 0),
  };
}

export async function severityBreakdown(
  db: Db,
  customerId?: string,
): Promise<{ severity: Severity; count: number }[]> {
  const params: unknown[] = [];
  let scope = '';
  if (customerId) {
    scope = 'WHERE customer_id = ?';
    params.push(customerId);
  }
  const rows = await db
    .prepare(
      `SELECT severity, COUNT(*) AS count FROM findings ${scope}
       GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC`,
    )
    .all<{ severity: Severity; count: string | number }>(...params);
  return rows.map((r) => ({ severity: r.severity, count: Number(r.count) }));
}

export async function listFindingsForAssessment(db: Db, assessmentId: string): Promise<Finding[]> {
  const rows = await db
    .prepare(`${FINDING_SELECT} WHERE f.assessment_id = ?`)
    .all<FindingRow>(assessmentId);
  return rows.map(mapFinding);
}
