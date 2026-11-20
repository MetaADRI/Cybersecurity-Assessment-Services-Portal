/**
 * Prepares an isolated Postgres database for the browser end-to-end tests:
 * schema + control library + admin account + fictional demonstration data.
 * It never touches the development database. Requires DATABASE_URL_TEST.
 */
import { loadEnv } from '../server/src/config/env';
import { openDb } from '../server/src/database/db';
import { runMigrations } from '../server/src/database/migrations';
import { seedDefaultConfiguration } from '../server/src/database/defaults';
import { seedDemoData } from '../server/src/database/seed';
import { createUser, findUserByEmail, countUsers } from '../server/src/repositories/users';
import { hashPassword } from '../server/src/security/password';

async function main(): Promise<void> {
  const env = loadEnv();
  const url = env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST must be set for end-to-end tests');
  if (url === env.DATABASE_URL) throw new Error('DATABASE_URL_TEST must differ from DATABASE_URL');

  const db = openDb(url);
  try {
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await runMigrations(db);
    await seedDefaultConfiguration(db);

    if ((await countUsers(db)) === 0 && !(await findUserByEmail(db, 'e2e-admin@example.com'))) {
      await createUser(db, {
        email: 'e2e-admin@example.com',
        fullName: 'E2E Administrator',
        role: 'admin',
        passwordHash: await hashPassword('E2e-Admin-Passw0rd!'),
      });
    }

    const result = await seedDemoData(db);
    console.log(
      `E2E database ready: ${result.customers} customers, ${result.assessments} assessments, ${result.findings} findings`,
    );
  } finally {
    await db.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
