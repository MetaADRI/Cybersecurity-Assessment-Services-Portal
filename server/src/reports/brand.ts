import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BRAND_DIR = join(process.cwd(), 'client', 'public', 'brand');

export function brandImage(name: string): string | null {
  const file = join(BRAND_DIR, name);
  return existsSync(file) ? file : null;
}
