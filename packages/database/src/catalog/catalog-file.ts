import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogEntry } from './validate';

// The committed global catalog (D7: git is the source of truth). Read by the
// sync and by code that computes from the catalog without a database (the
// curated recipe pool, plan-ingredient-catalog §6.2).

export const CATALOG_FILE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/ingredients/catalog.json',
);

export function readCatalogFile(path: string = CATALOG_FILE_PATH): CatalogEntry[] {
  return JSON.parse(readFileSync(path, 'utf8')) as CatalogEntry[];
}
