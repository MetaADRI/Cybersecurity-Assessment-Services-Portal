import { loadEnv } from '../config/env';
import { openDb } from './db';

/**
 * Resets the Postgres schema. Destructive by design, so it refuses to run
 * without an explicit --yes flag.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to reset the database without --yes');
    console.error('Example: npm run db:reset -- --yes');
    process.exit(1);
  }

  const db = openDb(env.DATABASE_URL);
  try {
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Reset public schema. Run "npm run db:migrate" to recreate the schema.');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
