import { loadEnv } from './config/env';
import { openDb } from './database/db';
import { runMigrations } from './database/migrations';
import { seedDefaultConfiguration } from './database/defaults';
import { createApp } from './app';
import { logger } from './utils/logger';
import { purgeExpiredSessions } from './repositories/users';
import { purgeExpiredClientSessions } from './repositories/clients';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = openDb(env.DATABASE_URL);

  const { applied } = await runMigrations(db);
  if (applied.length > 0) logger.info('Applied database migrations', { versions: applied });
  await seedDefaultConfiguration(db);
  await purgeExpiredSessions(db);
  await purgeExpiredClientSessions(db);

  const app = await createApp({ db, env });

  const server = app.listen(env.PORT, () => {
    logger.info('ODCMP server listening', {
      port: env.PORT,
      url: `http://localhost:${env.PORT}`,
      env: env.NODE_ENV,
    });
  });

  function shutdown(signal: string): void {
    logger.info('Shutting down', { signal });
    server.close(async () => {
      try {
        await db.close();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch((error: unknown) => {
  logger.error('Fatal startup error', { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
