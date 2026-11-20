import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import type { AuditEvent } from '../../../shared/types';

export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Append-only audit record. There is no application endpoint that updates or
 * deletes audit rows; ordinary users cannot alter them through the API.
 */
export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, actor_email, action, entity_type, entity_id, summary, metadata_json, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.actorId ?? null,
      input.actorEmail ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.summary,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ip ?? null,
      nowIso(),
    );
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
}

export async function listAudit(
  db: Db,
  opts: {
    page: number;
    pageSize: number;
    entityType?: string;
    entityId?: string;
    actorId?: string;
  },
): Promise<{ items: AuditEvent[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.entityType) {
    where.push('entity_type = ?');
    params.push(opts.entityType);
  }
  if (opts.entityId) {
    where.push('entity_id = ?');
    params.push(opts.entityId);
  }
  if (opts.actorId) {
    where.push('actor_id = ?');
    params.push(opts.actorId);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(
    (await db
      .prepare(`SELECT COUNT(*) AS c FROM audit_events ${clause}`)
      .get<{ c: number | string }>(...params))!.c,
  );
  const rows = await db
    .prepare(
      `SELECT id, actor_id, actor_email, action, entity_type, entity_id, summary, created_at
       FROM audit_events ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all<AuditRow>(...params, opts.pageSize, (opts.page - 1) * opts.pageSize);
  return {
    items: rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      actorEmail: r.actor_email,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      summary: r.summary,
      createdAt: r.created_at,
    })),
    total,
  };
}
