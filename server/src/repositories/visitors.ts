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
  serviceKey: string;
  /** Temporary testing mode: record the run without enforcing the one-per-visitor rule. */
  allowRepeat?: boolean;
}

export interface ReserveResult {
  visitor: VisitorRow;
  blocked: boolean;
  usedService: string | null;
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
): Promise<VisitorRow> {
  const existing = await getVisitorByCookie(db, cookieId);
  if (!existing) {
    const id = newId();
    await db
      .prepare(
        `INSERT INTO visitors (id, cookie_id, ip_hash, fingerprint_hash, email, client_id, free_service_used, free_used_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      )
      .run(id, cookieId, ipHash, fingerprintHash, email, nowIso());
    return (await getVisitorById(db, id))!;
  }
  await db
    .prepare(
      `UPDATE visitors
       SET ip_hash = ?, fingerprint_hash = COALESCE(?, fingerprint_hash), email = COALESCE(?, email)
       WHERE id = ?`,
    )
    .run(ipHash, fingerprintHash, email, existing.id);
  return (await getVisitorById(db, existing.id))!;
}

/**
 * Reserve a free run before any network work starts. The transaction is
 * immediate so two parallel requests cannot both pass the eligibility check.
 */
export async function reserveFreeService(db: Db, input: ReserveInput): Promise<ReserveResult> {
  const tx = db.transaction(async (): Promise<ReserveResult> => {
    const visitor = await touchVisitor(
      db,
      input.cookieId,
      input.ipHash,
      input.fingerprintHash ?? null,
      input.email?.trim().toLowerCase() || null,
    );

    if (!input.allowRepeat) {
      if (visitor.free_service_used) {
        return { visitor, blocked: true, usedService: visitor.free_service_used };
      }

      const fingerprintMatch = input.fingerprintHash
        ? await db
            .prepare(
              `SELECT free_service_used FROM visitors
               WHERE fingerprint_hash = ? AND free_service_used IS NOT NULL
               LIMIT 1`,
            )
            .get<{ free_service_used: string }>(input.fingerprintHash)
        : undefined;

      const emailMatch = visitor.email
        ? await db
            .prepare(
              `SELECT free_service_used FROM visitors
               WHERE lower(email) = lower(?) AND free_service_used IS NOT NULL
               LIMIT 1`,
            )
            .get<{ free_service_used: string }>(visitor.email)
        : undefined;

      const match = fingerprintMatch ?? emailMatch;
      if (match) {
        return { visitor, blocked: true, usedService: match.free_service_used };
      }
    }

    await db
      .prepare('UPDATE visitors SET free_service_used = ?, free_used_at = ? WHERE id = ?')
      .run(input.serviceKey, nowIso(), visitor.id);
    return {
      visitor: (await getVisitorById(db, visitor.id))!,
      blocked: false,
      usedService: null,
    };
  });
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
