import type { Db } from '../database/db';
import { nowIso } from '../utils/time';
import type { Category, Control } from '../../../shared/types';
import { DEFAULT_COVERAGE_THRESHOLD } from '../../../shared/constants';

export interface ScoringSettings {
  coverageThreshold: number;
  rubric: { effective: number; partially_effective: number; ineffective: number };
}

export async function getScoringSettings(db: Db): Promise<ScoringSettings> {
  const row = await db
    .prepare('SELECT value_json FROM app_settings WHERE key = ?')
    .get<{ value_json: string }>('scoring');
  if (!row) return { coverageThreshold: DEFAULT_COVERAGE_THRESHOLD, rubric: { ...NUMERIC_RUBRIC } };
  try {
    const parsed = JSON.parse(row.value_json);
    return {
      coverageThreshold: parsed.coverageThreshold ?? DEFAULT_COVERAGE_THRESHOLD,
      rubric: {
        effective: numberOr(parsed.rubric?.effective, NUMERIC_RUBRIC.effective),
        partially_effective: numberOr(
          parsed.rubric?.partially_effective,
          NUMERIC_RUBRIC.partially_effective,
        ),
        ineffective: numberOr(parsed.rubric?.ineffective, NUMERIC_RUBRIC.ineffective),
      },
    };
  } catch {
    return { coverageThreshold: DEFAULT_COVERAGE_THRESHOLD, rubric: { ...NUMERIC_RUBRIC } };
  }
}

const NUMERIC_RUBRIC = { effective: 100, partially_effective: 50, ineffective: 0 };

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function setScoringSettings(
  db: Db,
  settings: ScoringSettings,
  updatedBy: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run('scoring', JSON.stringify(settings), nowIso(), updatedBy);
}

export async function listCategories(db: Db, includeInactive = false): Promise<Category[]> {
  const sql = includeInactive
    ? 'SELECT * FROM security_categories ORDER BY sort_order ASC'
    : 'SELECT * FROM security_categories WHERE active = 1 ORDER BY sort_order ASC';
  const rows = await db.prepare(sql).all<{
    id: string;
    category_key: string;
    name: string;
    description: string;
    weight: number;
    sort_order: number;
    active: number;
  }>();
  return rows.map((r) => ({
    id: r.id,
    categoryKey: r.category_key,
    name: r.name,
    description: r.description,
    weight: r.weight,
    sortOrder: r.sort_order,
    active: r.active === 1,
  }));
}

export async function setCategoryWeights(db: Db, weights: Record<string, number>): Promise<void> {
  const tx = db.transaction(async () => {
    const stmt = db.prepare(
      'UPDATE security_categories SET weight = ?, updated_at = ? WHERE category_key = ?',
    );
    for (const [key, weight] of Object.entries(weights)) {
      await stmt.run(weight, nowIso(), key);
    }
  });
  await tx();
}

interface ControlRow {
  id: string;
  control_key: string;
  category_id: string;
  name: string;
  description: string;
  guidance: string;
  rubric: string;
  applicability: string;
  evidence_requirements: string;
  weight: number;
  active: number;
  category_key: string;
  category_name: string;
}

function mapControl(row: ControlRow): Control {
  return {
    id: row.id,
    controlKey: row.control_key,
    categoryId: row.category_id,
    categoryKey: row.category_key,
    categoryName: row.category_name,
    name: row.name,
    description: row.description,
    guidance: row.guidance,
    rubric: row.rubric,
    applicability: row.applicability,
    evidenceRequirements: row.evidence_requirements,
    weight: row.weight,
    active: row.active === 1,
  };
}

const CONTROL_SELECT = `
  SELECT c.*, cat.category_key AS category_key, cat.name AS category_name
  FROM security_controls c
  JOIN security_categories cat ON cat.id = c.category_id`;

export async function listControls(
  db: Db,
  opts: { includeInactive?: boolean; categoryKey?: string } = {},
): Promise<Control[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeInactive) where.push('c.active = 1');
  if (opts.categoryKey) {
    where.push('cat.category_key = ?');
    params.push(opts.categoryKey);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db
    .prepare(`${CONTROL_SELECT} ${clause} ORDER BY cat.sort_order ASC, c.control_key ASC`)
    .all<ControlRow>(...params);
  return rows.map(mapControl);
}

export async function getControl(db: Db, id: string): Promise<Control | null> {
  const row = await db.prepare(`${CONTROL_SELECT} WHERE c.id = ?`).get<ControlRow>(id);
  return row ? mapControl(row) : null;
}

export async function updateControl(
  db: Db,
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    guidance: string;
    rubric: string;
    applicability: string;
    evidenceRequirements: string;
    weight: number;
    active: boolean;
  }>,
): Promise<Control | null> {
  const columns: Record<string, string> = {
    name: 'name',
    description: 'description',
    guidance: 'guidance',
    rubric: 'rubric',
    applicability: 'applicability',
    evidenceRequirements: 'evidence_requirements',
    weight: 'weight',
    active: 'active',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
  }
  if (sets.length === 0) return await getControl(db, id);
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.prepare(`UPDATE security_controls SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return await getControl(db, id);
}
