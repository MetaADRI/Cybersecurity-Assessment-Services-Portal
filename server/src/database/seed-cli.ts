import { loadEnv } from '../config/env';
import { openDb } from './db';
import { runMigrations } from './migrations';
import { seedDefaultConfiguration } from './defaults';
import { seedDemoData, hasDemoData } from './seed';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = openDb(env.DATABASE_URL);
  try {
    await runMigrations(db);
    await seedDefaultConfiguration(db);

    const replace = process.argv.includes('--replace');

    if ((await hasDemoData(db)) && !replace) {
      console.log('Demonstration data is already loaded.');
      console.log('Use "npm run db:seed -- --replace" to remove and reload only the demo records.');
      return;
    }

    const result = await seedDemoData(db, { replace });
    console.log(
      JSON.stringify(
        {
          customers: result.customers,
          assessments: result.assessments,
          findings: result.findings,
          replaced: result.replaced,
          note: 'All loaded records are fictional and flagged is_demo = 1.',
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
