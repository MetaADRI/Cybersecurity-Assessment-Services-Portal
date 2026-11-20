import { loadEnv } from '../config/env';
import { openDb } from './db';
import { runMigrations } from './migrations';
import { seedDefaultConfiguration } from './defaults';

function databaseLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '<database>';
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const db = openDb(env.DATABASE_URL);
  try {
    const { applied } = await runMigrations(db);
    await seedDefaultConfiguration(db);
    const tables =
      (await db
        .prepare(
          "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
        )
        .get<{ c: string | number }>()) ?? { c: 0 };
    console.log(
      JSON.stringify(
        {
          database: databaseLabel(env.DATABASE_URL),
          appliedMigrations: applied,
          tables: Number(tables.c),
          message: applied.length ? 'Migrations applied.' : 'Database already up to date.',
        },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
