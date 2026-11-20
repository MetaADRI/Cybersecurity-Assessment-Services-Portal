import { loadEnv } from '../config/env';
import { openDb } from './db';
import { runMigrations } from './migrations';
import { seedDefaultConfiguration } from './defaults';
import { countUsers, createUser, findUserByEmail } from '../repositories/users';
import { hashPassword } from '../security/password';
import { recordAudit } from '../repositories/audit';

/**
 * Creates the first administrator account.
 *
 * Credentials come from the environment (never from source code, never printed):
 *   ODCMP_ADMIN_EMAIL=admin@example.com ODCMP_ADMIN_PASSWORD=... npm run db:bootstrap
 *
 * If no users exist and no credentials are supplied, the script explains what to
 * do and exits without creating anything.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const db = openDb(env.DATABASE_URL);
  try {
    await runMigrations(db);
    await seedDefaultConfiguration(db);

    if ((await countUsers(db)) > 0) {
      console.log('A user already exists; no bootstrap account was created.');
      return;
    }

    const email = process.env.ODCMP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ODCMP_ADMIN_PASSWORD;
    const fullName = process.env.ODCMP_ADMIN_NAME?.trim() || 'OpenDefenders Administrator';

    if (!email || !password) {
      console.log('No administrator account exists yet. Create one with:');
      console.log(
        '  ODCMP_ADMIN_EMAIL=you@example.com ODCMP_ADMIN_PASSWORD="<strong-password>" npm run db:bootstrap',
      );
      console.log('The password must be at least 10 characters and is never written to logs.');
      return;
    }
    if (password.length < 10) {
      console.error('ODCMP_ADMIN_PASSWORD must be at least 10 characters.');
      process.exitCode = 1;
      return;
    }
    if (await findUserByEmail(db, email)) {
      console.log('A user with that email already exists; no account was created.');
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(db, { email, fullName, role: 'admin', passwordHash });
    await recordAudit(db, {
      actorId: user.id,
      actorEmail: user.email,
      action: 'user.bootstrap',
      entityType: 'user',
      entityId: user.id,
      summary: `Bootstrapped the first administrator account (${user.email})`,
    });
    // The password itself is never logged.
    console.log(`Administrator account created for ${user.email}.`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error('Bootstrap failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
