import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPortionsOverlay,
  PORTIONS_OVERLAY_PATH,
  readPortionsOverlay,
} from './portions-overlay';
import type { CatalogEntry } from './validate';

// The committed global catalog (D7: git is the source of truth). Read by the
// sync and by code that computes from the catalog without a database (the
// curated recipe pool, plan-ingredient-catalog §6.2).

export const CATALOG_FILE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/ingredients/catalog.json',
);

/** The generated catalog.json exactly as written by the build, without the portions overlay. */
export function readGeneratedCatalogFile(path: string = CATALOG_FILE_PATH): CatalogEntry[] {
  return JSON.parse(readFileSync(path, 'utf8')) as CatalogEntry[];
}

/**
 * The catalog the app runs on: catalog.json plus the curated portions overlay
 * (portions-overlay.ts). A custom `path` (tests) skips the overlay unless an
 * `overlayPath` is passed too.
 */
export function readCatalogFile(
  path: string = CATALOG_FILE_PATH,
  overlayPath: string | null = path === CATALOG_FILE_PATH ? PORTIONS_OVERLAY_PATH : null,
): CatalogEntry[] {
  const entries = readGeneratedCatalogFile(path);
  return overlayPath === null
    ? entries
    : applyPortionsOverlay(entries, readPortionsOverlay(overlayPath));
}
