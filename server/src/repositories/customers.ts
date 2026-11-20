import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import type { Customer } from '../../../shared/types';
import { ConflictError as Conflict } from '../utils/errors';

interface CustomerRow {
  id: string;
  name: string;
  description: string | null;
  industry: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  scope: string | null;
  status: 'active' | 'archived';
  is_demo: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    industry: row.industry,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    phone: row.phone,
    scope: row.scope,
    status: row.status,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export interface ListCustomersOptions {
  page: number;
  pageSize: number;
  q?: string;
  status?: 'active' | 'archived';
  sort?: string;
  dir: 'asc' | 'desc';
}

const SORTABLE: Record<string, string> = {
  name: 'name',
  industry: 'industry',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

export async function listCustomers(
  db: Db,
  opts: ListCustomersOptions,
): Promise<{ items: Customer[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    where.push('status = ?');
    params.push(opts.status);
  }
  if (opts.q) {
    where.push(
      "(lower(name) LIKE ? OR lower(industry) LIKE ? OR lower(COALESCE(contact_name, '')) LIKE ?)",
    );
    const like = `%${opts.q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(
    (await db
      .prepare(`SELECT COUNT(*) AS c FROM customers ${clause}`)
      .get<{ c: number | string }>(...params))!.c,
  );
  const sortCol = SORTABLE[opts.sort ?? 'name'] ?? 'name';
  const dir = opts.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = await db
    .prepare(`SELECT * FROM customers ${clause} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`)
    .all<CustomerRow>(...params, opts.pageSize, (opts.page - 1) * opts.pageSize);
  return { items: rows.map(mapCustomer), total };
}

export async function getCustomer(db: Db, id: string): Promise<Customer | null> {
  const row = await db.prepare('SELECT * FROM customers WHERE id = ?').get<CustomerRow>(id);
  return row ? mapCustomer(row) : null;
}

export async function findActiveCustomerByName(db: Db, name: string): Promise<Customer | null> {
  const row = await db
    .prepare(`SELECT * FROM customers WHERE lower(name) = ? AND status = 'active'`)
    .get<CustomerRow>(name.toLowerCase());
  return row ? mapCustomer(row) : null;
}

export async function createCustomer(
  db: Db,
  input: {
    name: string;
    description?: string | null;
    industry: string;
    contactName?: string | null;
    contactEmail?: string | null;
    phone?: string | null;
    scope?: string | null;
    createdBy: string | null;
    isDemo?: boolean;
  },
): Promise<Customer> {
  if (await findActiveCustomerByName(db, input.name)) {
    throw new Conflict(`An active customer named "${input.name}" already exists`);
  }
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO customers (id, name, description, industry, contact_name, contact_email, phone, scope, status, is_demo, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.description || null,
      input.industry,
      input.contactName || null,
      input.contactEmail || null,
      input.phone || null,
      input.scope || null,
      input.isDemo ? 1 : 0,
      now,
      now,
      input.createdBy,
    );
  return (await getCustomer(db, id))!;
}

export async function updateCustomer(
  db: Db,
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    industry: string;
    contactName: string | null;
    contactEmail: string | null;
    phone: string | null;
    scope: string | null;
    status: 'active' | 'archived';
  }>,
): Promise<Customer | null> {
  const existing = await getCustomer(db, id);
  if (!existing) return null;
  if (patch.name && patch.name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await findActiveCustomerByName(db, patch.name);
    if (clash && clash.id !== id) {
      throw new Conflict(`An active customer named "${patch.name}" already exists`);
    }
  }
  const columns: Record<string, string> = {
    name: 'name',
    description: 'description',
    industry: 'industry',
    contactName: 'contact_name',
    contactEmail: 'contact_email',
    phone: 'phone',
    scope: 'scope',
    status: 'status',
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
  await db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return await getCustomer(db, id);
}

export async function countCustomers(db: Db, status?: 'active' | 'archived'): Promise<number> {
  const sql = status
    ? 'SELECT COUNT(*) AS c FROM customers WHERE status = ?'
    : 'SELECT COUNT(*) AS c FROM customers';
  const row = status
    ? await db.prepare(sql).get<{ c: number | string }>(status)
    : await db.prepare(sql).get<{ c: number | string }>();
  return Number(row!.c);
}
