import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import type { ServiceRequestStatus } from '../../../shared/constants';
import type { ClientServiceRequest, StaffServiceRequest } from '../../../shared/client-types';

interface RequestRow {
  id: string;
  client_id: string | null;
  visitor_id: string | null;
  service_key: string;
  service_name: string;
  message: string | null;
  contact_preference: 'email' | 'phone' | 'whatsapp';
  status: ServiceRequestStatus;
  assigned_to: string | null;
  assigned_to_name: string | null;
  staff_note: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  client_email?: string | null;
  client_company?: string | null;
  free_score?: number | null;
  free_target?: string | null;
}

function mapClient(row: RequestRow): ClientServiceRequest {
  return {
    id: row.id,
    serviceKey: row.service_key,
    serviceName: row.service_name,
    message: row.message,
    contactPreference: row.contact_preference,
    status: row.status,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    staffNote: row.staff_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStaff(row: RequestRow): StaffServiceRequest {
  return {
    ...mapClient(row),
    clientId: row.client_id,
    clientName: row.client_name ?? null,
    clientEmail: row.client_email ?? null,
    clientCompany: row.client_company ?? null,
    visitorId: row.visitor_id,
    freeScore: row.free_score ?? null,
    freeTarget: row.free_target ?? null,
  };
}

const BASE_SELECT = `
  SELECT sr.*, sc.name AS service_name, u.full_name AS assigned_to_name,
         cu.name AS client_name, cu.email AS client_email, cu.company AS client_company,
         fr.score AS free_score, fr.target AS free_target
  FROM service_requests sr
  JOIN service_catalog sc ON sc.key = sr.service_key
  LEFT JOIN users u ON u.id = sr.assigned_to
  LEFT JOIN client_users cu ON cu.id = sr.client_id
  LEFT JOIN visitors v ON v.id = sr.visitor_id
  LEFT JOIN free_service_runs fr ON fr.id = (
    SELECT id FROM free_service_runs
    WHERE visitor_id = v.id AND status = 'completed'
    ORDER BY created_at DESC LIMIT 1
  )`;

export async function findOpenClientRequest(
  db: Db,
  clientId: string,
  serviceKey: string,
): Promise<ClientServiceRequest | null> {
  const row = await db
    .prepare(
      `${BASE_SELECT}
       WHERE sr.client_id = ? AND sr.service_key = ?
         AND sr.status IN ('new','contacted','in_progress')
       LIMIT 1`,
    )
    .get<RequestRow>(clientId, serviceKey);
  return row ? mapClient(row) : null;
}

export async function createServiceRequest(
  db: Db,
  input: {
    clientId: string | null;
    visitorId: string | null;
    serviceKey: string;
    message: string | null;
    contactPreference: 'email' | 'phone' | 'whatsapp';
  },
): Promise<StaffServiceRequest> {
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO service_requests
         (id, client_id, visitor_id, service_key, message, contact_preference, status, assigned_to, staff_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', NULL, NULL, ?, ?)`,
    )
    .run(
      id,
      input.clientId,
      input.visitorId,
      input.serviceKey,
      input.message,
      input.contactPreference,
      now,
      now,
    );
  return (await getStaffRequest(db, id))!;
}

export async function listClientRequests(
  db: Db,
  clientId: string,
): Promise<ClientServiceRequest[]> {
  const rows = await db
    .prepare(`${BASE_SELECT} WHERE sr.client_id = ? ORDER BY sr.created_at DESC`)
    .all<RequestRow>(clientId);
  return rows.map(mapClient);
}

export async function listStaffRequests(db: Db): Promise<StaffServiceRequest[]> {
  const rows = await db
    .prepare(`${BASE_SELECT} ORDER BY sr.created_at DESC LIMIT 500`)
    .all<RequestRow>();
  return rows.map(mapStaff);
}

export async function getStaffRequest(db: Db, id: string): Promise<StaffServiceRequest | null> {
  const row = await db.prepare(`${BASE_SELECT} WHERE sr.id = ?`).get<RequestRow>(id);
  return row ? mapStaff(row) : null;
}

export async function updateStaffRequest(
  db: Db,
  id: string,
  input: {
    status?: ServiceRequestStatus;
    assignedTo?: string | null;
    staffNote?: string;
  },
): Promise<StaffServiceRequest | null> {
  const current = await db.prepare('SELECT * FROM service_requests WHERE id = ?').get<RequestRow>(id);
  if (!current) return null;
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [nowIso()];
  if (input.status !== undefined) {
    sets.push('status = ?');
    values.push(input.status);
  }
  if (input.assignedTo !== undefined) {
    sets.push('assigned_to = ?');
    values.push(input.assignedTo);
  }
  if (input.staffNote !== undefined) {
    sets.push('staff_note = ?');
    values.push(input.staffNote || null);
  }
  values.push(id);
  await db.prepare(`UPDATE service_requests SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return await getStaffRequest(db, id);
}

export async function listAssignableStaff(
  db: Db,
): Promise<{ id: string; name: string; role: string }[]> {
  return await db
    .prepare(
      `SELECT id, full_name AS name, role FROM users
       WHERE status = 'active' AND role IN ('admin','analyst')
       ORDER BY full_name`,
    )
    .all<{ id: string; name: string; role: string }>();
}
