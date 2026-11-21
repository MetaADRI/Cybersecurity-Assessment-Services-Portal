import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Minimal .env loader so the application does not need an extra dependency.
 * Existing process environment variables always win over file values.
 */
function loadDotEnv(rootDir: string): void {
  const file = path.join(rootDir, '.env');
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  REPORTS_DIR: z.string().default('./reports/generated'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(20),
  /**
   * Escape hatch for local testing. When true, the per-visitor, per-IP and
   * per-target free-check limits are skipped; the 10 requests/minute/IP limiter
   * still applies.
   */
  FREE_CHECKS_UNLIMITED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  FREE_CHECKS_PER_VISITOR_PER_DAY: z.coerce.number().int().min(1).default(5),
  FREE_CHECKS_PER_IP_PER_DAY: z.coerce.number().int().min(1).default(20),
  FREE_CHECKS_PER_TARGET_PER_HOUR: z.coerce.number().int().min(1).default(3),
  CLIENT_FREE_CHECKS_PER_DAY: z.coerce.number().int().min(1).default(20),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(rootDir = process.cwd()): Env {
  if (cached) return cached;
  loadDotEnv(rootDir);
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
