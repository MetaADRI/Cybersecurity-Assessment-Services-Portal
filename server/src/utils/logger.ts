/**
 * Structured JSON logger. Never logs passwords, session tokens or CSRF
 * tokens: callers are responsible for passing only safe fields, and the
 * redaction list below is a second line of defence.
 */
const REDACTED = [
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'csrf',
  'cookie',
  'authorization',
  'sessionSecret',
];

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info') as Level;
  return LEVEL_ORDER[raw] ?? 20;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED.includes(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < activeLevel()) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};
