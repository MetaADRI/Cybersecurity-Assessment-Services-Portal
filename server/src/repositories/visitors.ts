import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';

export interface VisitorRow {
  id: string;
  cookie_id: string;
  ip_hash: string;
  fingerprint_hash: string | null;
  email: string | null;
  client_id: string | null;
  free_service_used: string | null;
  free_used_at: string | null;
  created_at: string;
}

export interface ReserveInput {
  cookieId: string;
  ipHash: string;
  fingerprintHash?: string | null;
  email?: string | null;
  clientId?: string | null;
  /** Kept for call-site compatibility; the free-check gate is now rate-limit based. */
  serviceKey?: string;
}

export interface ReserveResult {
  visitor: VisitorRow;
  blocked: false;
  usedService: null;
}

export async function getVisitorByCookie(db: Db, cookieId: string): Promise<VisitorRow | null> {
  return (
    (await db.prepare('SELECT * FROM visitors WHERE cookie_id = ?').get<VisitorRow>(cookieId)) ?? null
  );
}

export async function getVisitorById(db: Db, id: string): Promise<VisitorRow | null> {
  return (await db.prepare('SELECT * FROM visitors WHERE id = ?').get<VisitorRow>(id)) ?? null;
}

async function touchVisitor(
  db: Db,
  cookieId: string,
  ipHash: string,
  fingerprintHash: string | null,
  email: string | null,
  clientId: string | null,
): Promise<VisitorRow> {
  const existing = await getVisitorByCookie(db, cookieId);
  if (!existing) {
    const id = newId();
    await db
      .prepare(
        `INSERT INTO visitors (id, cookie_id, ip_hash, fingerprint_hash, email, client_id, free_service_used, free_used_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(id, cookieId, ipHash, fingerprintHash, email, clientId, nowIso());
    return (await getVisitorById(db, id))!;
  }
  await db
    .prepare(
      `UPDATE visitors
       SET ip_hash = ?, fingerprint_hash = COALESCE(?, fingerprint_hash),
           email = COALESCE(?, email), client_id = COALESCE(?, client_id)
       WHERE id = ?`,
    )
    .run(ipHash, fingerprintHash, email, clientId, existing.id);
  return (await getVisitorById(db, existing.id))!;
}

/**
 * Create or update the anonymous visitor record before any network work starts.
 * The transaction is immediate so parallel requests cannot create duplicate
 * identity rows. Eligibility is handled by the rate-limit repository instead.
 */
export async function reserveFreeService(db: Db, input: ReserveInput): Promise<ReserveResult> {
  const tx = db.transaction(async (): Promise<ReserveResult> => ({
    visitor: await touchVisitor(
      db,
      input.cookieId,
      input.ipHash,
      input.fingerprintHash ?? null,
      input.email?.trim().toLowerCase() || null,
      input.clientId ?? null,
    ),
    blocked: false,
    usedService: null,
  }));
  return await tx();
}

export async function linkVisitorToClient(
  db: Db,
  input: { cookieId: string; clientId: string; email: string },
): Promise<void> {
  await db
    .prepare(`UPDATE visitors SET client_id = ?, email = ? WHERE cookie_id = ?`)
    .run(input.clientId, input.email.trim().toLowerCase(), input.cookieId);
}
