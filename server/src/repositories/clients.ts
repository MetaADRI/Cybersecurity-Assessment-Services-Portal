import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import type { ClientUser } from '../../../shared/client-types';

export const CLIENT_SESSION_MINUTES = 5;

interface ClientRow {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  password_hash: string;
  email_verified: number;
  active: number;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface ClientWithSecret extends ClientUser {
  passwordHash: string;
  active: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}

function mapRow(row: ClientRow): ClientWithSecret {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    phone: row.phone,
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    passwordHash: row.password_hash,
    active: row.active === 1,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
  };
}

export function toClientUser(client: ClientWithSecret): ClientUser {
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    company: client.company,
    phone: client.phone,
    emailVerified: client.emailVerified,
    createdAt: client.createdAt,
    lastLoginAt: client.lastLoginAt,
  };
}

export async function findClientByEmail(db: Db, email: string): Promise<ClientWithSecret | null> {
  const row = await db
    .prepare('SELECT * FROM client_users WHERE lower(email) = lower(?)')
    .get<ClientRow>(email.trim().toLowerCase());
  return row ? mapRow(row) : null;
}

export async function findClientById(db: Db, id: string): Promise<ClientWithSecret | null> {
  const row = await db.prepare('SELECT * FROM client_users WHERE id = ?').get<ClientRow>(id);
  return row ? mapRow(row) : null;
}

export async function createClient(
  db: Db,
  input: {
    name: string;
    email: string;
    company: string;
    phone: string;
    passwordHash: string;
  },
): Promise<ClientWithSecret> {
  const id = newId();
  await db.prepare(
    `INSERT INTO client_users
       (id, name, email, company, phone, password_hash, email_verified, active, failed_login_attempts, locked_until, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, NULL, ?, NULL)`,
  ).run(
    id,
    input.name,
    input.email.trim().toLowerCase(),
    input.company,
    input.phone,
    input.passwordHash,
    nowIso(),
  );
  return (await findClientById(db, id))!;
}

export async function markClientVerified(db: Db, clientId: string): Promise<void> {
  await db.prepare('UPDATE client_users SET email_verified = 1 WHERE id = ?').run(clientId);
}

export async function recordLoginSuccess(db: Db, clientId: string): Promise<void> {
  await db.prepare(
    `UPDATE client_users
     SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?
     WHERE id = ?`,
  ).run(nowIso(), clientId);
}

export async function recordLoginFailure(
  db: Db,
  clientId: string,
  lockMinutes = 15,
): Promise<void> {
  const row = await db
    .prepare('SELECT failed_login_attempts FROM client_users WHERE id = ?')
    .get<{ failed_login_attempts: number }>(clientId);
  if (!row) return;
  const attempts = row.failed_login_attempts + 1;
  const lockedUntil =
    attempts >= 5 ? new Date(Date.now() + lockMinutes * 60_000).toISOString() : null;
  await db
    .prepare('UPDATE client_users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
    .run(attempts, lockedUntil, clientId);
}

export async function updateClientProfile(
  db: Db,
  clientId: string,
  input: { name?: string; company?: string; phone?: string },
): Promise<void> {
  const current = await findClientById(db, clientId);
  if (!current) return;
  await db.prepare('UPDATE client_users SET name = ?, company = ?, phone = ? WHERE id = ?').run(
    input.name ?? current.name,
    input.company ?? current.company,
    input.phone ?? current.phone,
    clientId,
  );
}

interface VerificationRow {
  id: string;
  client_id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
  attempts: number;
  created_at: string;
}

export async function createVerificationCode(
  db: Db,
  input: { clientId: string; email: string; codeHash: string; ttlMinutes?: number },
): Promise<string> {
  const id = newId();
  const now = nowIso();
  const expires = new Date(Date.now() + (input.ttlMinutes ?? 15) * 60_000).toISOString();
  const tx = db.transaction(async () => {
    await db
      .prepare(
        `UPDATE client_email_verifications SET consumed_at = ?
         WHERE client_id = ? AND consumed_at IS NULL`,
      )
      .run(now, input.clientId);
    await db
      .prepare(
        `INSERT INTO client_email_verifications
           (id, client_id, email, code_hash, expires_at, consumed_at, attempts, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 0, ?)`,
      )
      .run(id, input.clientId, input.email.trim().toLowerCase(), input.codeHash, expires, now);
  });
  await tx();
  return id;
}

export async function latestVerification(db: Db, clientId: string): Promise<VerificationRow | null> {
  return (
    (await db
      .prepare(
        `SELECT * FROM client_email_verifications
         WHERE client_id = ? AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get<VerificationRow>(clientId)) ?? null
  );
}

export async function recordVerificationAttempt(db: Db, id: string): Promise<number> {
  await db
    .prepare('UPDATE client_email_verifications SET attempts = attempts + 1 WHERE id = ?')
    .run(id);
  const row = await db
    .prepare('SELECT attempts FROM client_email_verifications WHERE id = ?')
    .get<{ attempts: number }>(id);
  return row?.attempts ?? 0;
}

export async function consumeVerification(db: Db, id: string): Promise<void> {
  await db.prepare('UPDATE client_email_verifications SET consumed_at = ? WHERE id = ?').run(
    nowIso(),
    id,
  );
}

interface ClientSessionRow {
  id: string;
  client_id: string;
  csrf_token: string;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
}

export interface ClientSession {
  id: string;
  clientId: string;
  csrfToken: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

function mapSession(row: ClientSessionRow): ClientSession {
  return {
    id: row.id,
    clientId: row.client_id,
    csrfToken: row.csrf_token,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    expiresAt: row.expires_at,
  };
}

export async function createClientSession(
  db: Db,
  input: { clientId: string; csrfToken: string },
): Promise<ClientSession> {
  const id = newId();
  const now = nowIso();
  const expires = new Date(Date.now() + CLIENT_SESSION_MINUTES * 60_000).toISOString();
  await db
    .prepare(
      `INSERT INTO client_sessions
         (id, client_id, csrf_token, created_at, last_activity_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.clientId, input.csrfToken, now, now, expires);
  return {
    id,
    clientId: input.clientId,
    csrfToken: input.csrfToken,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: expires,
  };
}

export async function getClientSession(db: Db, id: string): Promise<ClientSession | null> {
  const row = await db
    .prepare('SELECT * FROM client_sessions WHERE id = ?')
    .get<ClientSessionRow>(id);
  return row ? mapSession(row) : null;
}

export async function deleteClientSession(db: Db, id: string): Promise<void> {
  await db.prepare('DELETE FROM client_sessions WHERE id = ?').run(id);
}

export async function touchClientSession(db: Db, id: string): Promise<void> {
  const now = nowIso();
  const expires = new Date(Date.now() + CLIENT_SESSION_MINUTES * 60_000).toISOString();
  await db
    .prepare('UPDATE client_sessions SET last_activity_at = ?, expires_at = ? WHERE id = ?')
    .run(now, expires, id);
}

export async function purgeExpiredClientSessions(db: Db): Promise<void> {
  await db.prepare('DELETE FROM client_sessions WHERE expires_at < ?').run(nowIso());
}
