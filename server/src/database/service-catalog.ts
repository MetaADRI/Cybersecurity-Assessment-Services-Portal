import type { Db } from './db';
import { SERVICE_CATALOG } from '../../../shared/free-services';

/** Idempotent catalog seed. Existing rows are never overwritten. */
export async function seedServiceCatalog(db: Db): Promise<void> {
  const insert = db.prepare(
    `INSERT INTO service_catalog
       (key, name, tagline, description, category, is_free, sort_order, icon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (key) DO NOTHING`,
  );
  await db.transaction(async () => {
    for (const item of SERVICE_CATALOG) {
      await insert.run(
        item.key,
        item.name,
        item.tagline,
        item.description,
        item.category,
        item.isFree ? 1 : 0,
        item.sortOrder,
        item.icon,
      );
    }
  })();
}
