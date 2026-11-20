import type { Db } from '../database/db';
import type { ServiceCatalogItem } from '../../../shared/free-services';

interface CatalogRow {
  key: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  is_free: number;
  sort_order: number;
  icon: string;
}

function mapRow(row: CatalogRow): ServiceCatalogItem {
  return {
    key: row.key,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    isFree: row.is_free === 1,
    sortOrder: row.sort_order,
    icon: row.icon,
  };
}

export async function listCatalog(
  db: Db,
  opts: { freeOnly?: boolean } = {},
): Promise<ServiceCatalogItem[]> {
  const clause = opts.freeOnly ? 'WHERE is_free = 1' : '';
  const rows = await db
    .prepare(`SELECT * FROM service_catalog ${clause} ORDER BY sort_order, name`)
    .all<CatalogRow>();
  return rows.map(mapRow);
}

export async function getCatalogItem(db: Db, key: string): Promise<ServiceCatalogItem | null> {
  const row = await db.prepare('SELECT * FROM service_catalog WHERE key = ?').get<CatalogRow>(key);
  return row ? mapRow(row) : null;
}
