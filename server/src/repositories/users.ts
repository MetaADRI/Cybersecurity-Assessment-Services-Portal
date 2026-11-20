import type { Db } from '../database/db';
import { newId, nowIso } from '../utils/time';
import type { User } from '../../../shared/types';
import type { Role } from '../../../shared/constants';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: Role;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

function mapUser(row: UserRow): User & { passwordHash: string } {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    passwordHash: row.password_hash,
  };
}

export async function countUsers(db: Db): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM users').get<{ c: number | string }>();
  return Number(row!.c);
}

export async function findUserByEmail(
  db: Db,
  email: string,
): Promise<(User & { passwordHash: string }) | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get<UserRow>(email.toLowerCase());
  return row ? mapUser(row) : null;
}

export async function findUserById(db: Db, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(id);
  if (!row) return null;
  const { passwordHash: _hash, ...user } = mapUser(row);
  return user;
}

export async function listUsers(db: Db): Promise<User[]> {
  const rows = await db.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>();
  return rows.map((r) => {
    const { passwordHash: _hash, ...user } = mapUser(r);
    return user;
  });
}

export async function createUser(
  db: Db,
  input: { email: string; fullName: string; role: Role; passwordHash: string },
): Promise<User> {
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO users (id, email, full_name, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(id, input.email.toLowerCase(), input.fullName, input.passwordHash, input.role, now, now);
  return (await findUserById(db, id))!;
}

export async function updateUser(
  db: Db,
  id: string,
  patch: { fullName?: string; role?: Role; status?: 'active' | 'disabled'; passwordHash?: string },
): Promise<User | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.fullName !== undefined) {
    sets.push('full_name = ?');
    params.push(patch.fullName);
  }
  if (patch.role !== undefined) {
    sets.push('role = ?');
    params.push(patch.role);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.passwordHash !== undefined) {
    sets.push('password_hash = ?');
    params.push(patch.passwordHash);
  }
  if (sets.length === 0) return await findUserById(db, id);
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return await findUserById(db, id);
}

export interface SessionRecord {
  id: string;
  userId: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
}

export async function createSession(
  db: Db,
  input: { userId: string; csrfToken: string; ttlHours: number },
): Promise<SessionRecord> {
  const id = newId();
  const now = new Date();
  const expires = new Date(now.getTime() + input.ttlHours * 3600_000);
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, csrf_token, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.userId,
      input.csrfToken,
      now.toISOString(),
      now.toISOString(),
      expires.toISOString(),
    );
  return {
    id,
    userId: input.userId,
    csrfToken: input.csrfToken,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

export async function getSession(db: Db, sessionId: string): Promise<SessionRecord | null> {
  const row = await db.prepare('SELECT * FROM sessions WHERE id = ?').get<{
    id: string;
    user_id: string;
    csrf_token: string;
    created_at: string;
    expires_at: string;
  }>(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    csrfToken: row.csrf_token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function touchSession(db: Db, sessionId: string): Promise<void> {
  await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), sessionId);
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export async function purgeExpiredSessions(db: Db): Promise<number> {
  return (await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso())).changes;
}
