import type { Db } from '../database/db';
import type { FreeResult } from '../../../shared/free-services';

export const FREE_CHECK_DAY_MS = 24 * 60 * 60 * 1000;
export const FREE_CHECK_HOUR_MS = 60 * 60 * 1000;

export type FreeCheckLimitName = 'client' | 'visitor' | 'ip' | 'target';

export interface FreeCheckLimitHit {
  limit: FreeCheckLimitName;
  label: string;
  used: number;
  max: number;
  windowMs: number;
  resetAt: string;
  retryAfterSeconds: number;
  message: string;
}

export interface LimitCheckInput {
  visitorId: string;
  cookieId: string;
  ipHash: string;
  fingerprintHash?: string | null;
  clientId?: string | null;
  serviceKey: string;
  target?: string | null;
  perVisitorPerDay: number;
  perIpPerDay: number;
  perTargetPerHour: number;
  clientPerDay: number;
  nowMs?: number;
}

interface CountRow {
  used: string | number;
  oldest: string | null;
}

const LIMIT_LABELS: Record<FreeCheckLimitName, string> = {
  client: 'signed-in account',
  visitor: 'visitor',
  ip: 'IP address',
  target: 'target',
};

export function normalizeLimitTarget(serviceKey: string, target?: string | null): string | null {
  const raw = (target ?? '').trim();
  if (!raw) return null;

  if (serviceKey === 'website_check') {
    try {
      const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
      const url = new URL(candidate);
      return url.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return raw.toLowerCase();
    }
  }

  if (serviceKey === 'email_check' && raw.includes('@')) {
    return raw.split('@').pop()!.trim().toLowerCase().replace(/^www\./, '');
  }

  return raw.toLowerCase().replace(/\s+/g, ' ');
}

export function isUnreachableFreeResult(result: FreeResult): boolean {
  return result.findings.some((finding) => finding.id === 'web.unreachable');
}

async function countCompleted(
  db: Db,
  sql: string,
  params: unknown[],
  windowMs: number,
  nowMs: number,
): Promise<{ used: number; oldest: string | null }> {
  const cutoff = new Date(nowMs - windowMs).toISOString();
  const row = await db.prepare(sql).get<CountRow>(cutoff, ...params);
  return { used: Number(row?.used ?? 0), oldest: row?.oldest ?? null };
}

function buildHit(
  limit: FreeCheckLimitName,
  used: number,
  max: number,
  windowMs: number,
  oldest: string | null,
  nowMs: number,
): FreeCheckLimitHit | null {
  if (used < max) return null;
  const oldestMs = oldest ? Date.parse(oldest) : Number.NaN;
  const resetMs = Number.isFinite(oldestMs) ? oldestMs + windowMs : nowMs + windowMs;
  const resetAt = new Date(resetMs).toISOString();
  const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - nowMs) / 1000));
  const label = LIMIT_LABELS[limit];
  return {
    limit,
    label,
    used,
    max,
    windowMs,
    resetAt,
    retryAfterSeconds,
    message: `Free check limit reached for this ${label}. Try again in ${retryAfterSeconds} seconds or create a free account for a higher limit.`,
  };
}

export async function checkFreeCheckLimits(
  db: Db,
  input: LimitCheckInput,
): Promise<FreeCheckLimitHit | null> {
  const nowMs = input.nowMs ?? Date.now();
  const normalizedTarget = normalizeLimitTarget(input.serviceKey, input.target);
  const params = {
    visitorId: input.visitorId,
    cookieId: input.cookieId,
    ipHash: input.ipHash,
    fingerprintHash: input.fingerprintHash ?? null,
    clientId: input.clientId ?? null,
    target: normalizedTarget,
  };

  const identityCount = input.clientId
    ? await countCompleted(
        db,
        `SELECT COUNT(*) AS used, MIN(r.created_at) AS oldest
         FROM free_service_runs r
         JOIN visitors v ON v.id = r.visitor_id
         WHERE r.status = 'completed' AND r.created_at > ? AND v.client_id = ?`,
        [params.clientId],
        FREE_CHECK_DAY_MS,
        nowMs,
      )
    : await countCompleted(
        db,
        `SELECT COUNT(*) AS used, MIN(r.created_at) AS oldest
         FROM free_service_runs r
         WHERE r.status = 'completed'
           AND r.created_at > ?
           AND r.visitor_id IN (
             SELECT id FROM visitors
             WHERE cookie_id = ? OR ip_hash = ? OR fingerprint_hash = ?
           )`,
        [params.cookieId, params.ipHash, params.fingerprintHash],
        FREE_CHECK_DAY_MS,
        nowMs,
      );

  const identityHit = buildHit(
    input.clientId ? 'client' : 'visitor',
    identityCount.used,
    input.clientId ? input.clientPerDay : input.perVisitorPerDay,
    FREE_CHECK_DAY_MS,
    identityCount.oldest,
    nowMs,
  );
  if (identityHit) return identityHit;

  const ipCount = await countCompleted(
    db,
    `SELECT COUNT(*) AS used, MIN(r.created_at) AS oldest
     FROM free_service_runs r
     JOIN visitors v ON v.id = r.visitor_id
     WHERE r.status = 'completed' AND r.created_at > ? AND v.ip_hash = ?`,
    [params.ipHash],
    FREE_CHECK_DAY_MS,
    nowMs,
  );
  const ipHit = buildHit(
    'ip',
    ipCount.used,
    input.perIpPerDay,
    FREE_CHECK_DAY_MS,
    ipCount.oldest,
    nowMs,
  );
  if (ipHit) return ipHit;

  if (params.target) {
    const targetCount = await countCompleted(
      db,
      `SELECT COUNT(*) AS used, MIN(r.created_at) AS oldest
       FROM free_service_runs r
       WHERE r.status = 'completed' AND r.created_at > ? AND r.target = ?`,
      [params.target],
      FREE_CHECK_HOUR_MS,
      nowMs,
    );
    const targetHit = buildHit(
      'target',
      targetCount.used,
      input.perTargetPerHour,
      FREE_CHECK_HOUR_MS,
      targetCount.oldest,
      nowMs,
    );
    if (targetHit) return targetHit;
  }

  return null;
}
