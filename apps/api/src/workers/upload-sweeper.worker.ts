import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  uploadedFileRepository,
  uploadReferenceRepository,
  type IUploadedFileRepository,
  type IUploadReferenceRepository,
} from '@chefer/database';
import { env } from '../lib/env.js';
import { GENERATED_RECIPES_SUBDIR } from '../lib/image-cdn/local.js';
import { logger } from '../lib/logger.js';
import {
  referencedUploadPaths,
  UPLOADS_DIR,
  uploadsRelativePath,
} from '../lib/uploads/uploaded-files.js';

// ─── Uploads orphan sweeper (Phase 1 guardrails) ──────────────────────────────
// Files in the uploads volume used to be deleted only with the account that
// uploaded them, so every replaced recipe photo, abandoned form upload and
// re-generated recipe image stayed on the 1 GB VM's disk forever. Once per UTC
// day (hourly tick, first run 10 minutes after boot) this worker:
//   1. hard-deletes recipes soft-deleted (`deletedAt`) more than 30 days ago,
//      except ones a meal plan day or a food log still names (tombstones);
//      every FK onto recipes cascades or sets null, see
//      upload-reference.repository.ts;
//   2. deletes every file in the uploads root (user photos) and uploads/recipes
//      (generated images) that is older than 24 h and that NO row references
//      (users.image, recipes.imageUrl — soft-deleted ones included —
//      ingredient_prices / ingredients / ingredient_images .imageUrl,
//      posts.coverImage). The 24 h grace covers a photo uploaded while its
//      form is still open;
//   3. drops uploaded_files ledger rows whose file is gone, freeing quota.
// One `uploads.sweep` summary line is logged per run. UPLOAD_SWEEP_DRY_RUN=true
// logs what would happen and deletes nothing (recipes included).
// If the reference query fails the run stops before deleting anything.

const TICK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const ORPHAN_MIN_AGE_MS = DAY_MS;
export const SOFT_DELETE_PURGE_DAYS = 30;
const MAX_PURGE_PER_RUN = 500;

export interface UploadSweeperDeps {
  references: Pick<IUploadReferenceRepository, 'findUploadUrls' | 'purgeSoftDeletedRecipes'>;
  ledger: Pick<IUploadedFileRepository, 'allFileNames' | 'deleteByFileNames'>;
  dir: string;
  dryRun: boolean;
}

export interface SweepResult {
  dryRun: boolean;
  scanned: number;
  referenced: number;
  young: number;
  deleted: number;
  bytesFreed: number;
  ledgerRowsDeleted: number;
  purgedRecipes: number;
  keptInUseRecipes: number;
}

interface DiskFile {
  rel: string;
  size: number;
  mtimeMs: number;
}

/** The managed files (user uploads + generated recipe images) currently on disk. */
async function listManagedFiles(dir: string): Promise<DiskFile[]> {
  const out: DiskFile[] = [];
  for (const sub of ['', GENERATED_RECIPES_SUBDIR]) {
    let names: string[];
    try {
      names = await readdir(path.join(dir, sub));
    } catch {
      continue; // folder not created yet
    }
    for (const name of names) {
      const rel = sub ? `${sub}/${name}` : name;
      // Only names we create (uuid / recipe-hash + image extension): never a
      // probe file, a sub-folder or anything put there by hand.
      if (uploadsRelativePath(`/uploads/${rel}`) !== rel) continue;
      try {
        const info = await stat(path.join(dir, rel));
        if (info.isFile()) out.push({ rel, size: info.size, mtimeMs: info.mtimeMs });
      } catch {
        // vanished between readdir and stat
      }
    }
  }
  return out;
}

export class UploadSweeperWorker {
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;
  private lastSweepDay: string | null = null;
  private readonly overrides: Partial<UploadSweeperDeps>;

  constructor(deps: Partial<UploadSweeperDeps> = {}) {
    this.overrides = deps;
  }

  /** Resolved per run, so env is only read once the worker actually runs. */
  private get deps(): UploadSweeperDeps {
    return {
      references: uploadReferenceRepository,
      ledger: uploadedFileRepository,
      dir: UPLOADS_DIR,
      dryRun: env.UPLOAD_SWEEP_DRY_RUN,
      ...this.overrides,
    };
  }

  start(): void {
    if (this.timer) return;
    console.log('[UploadSweeperWorker] started (daily, hourly tick)');
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    this.firstRun = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
    this.timer = null;
    this.firstRun = null;
    console.log('[UploadSweeperWorker] stopped');
  }

  /** One pass per UTC day; the day is only marked done after a successful sweep. */
  async tick(now = new Date()): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    if (this.running || day === this.lastSweepDay) return;
    this.running = true;
    try {
      await this.sweep(now);
      this.lastSweepDay = day;
    } catch (err) {
      logger.error({ err }, 'uploads.sweep failed');
    } finally {
      this.running = false;
    }
  }

  /** Exposed for tests — one full pass regardless of the day marker. */
  async sweep(now = new Date()): Promise<SweepResult> {
    const { references, ledger, dir, dryRun } = this.deps;
    const result: SweepResult = {
      dryRun,
      scanned: 0,
      referenced: 0,
      young: 0,
      deleted: 0,
      bytesFreed: 0,
      ledgerRowsDeleted: 0,
      purgedRecipes: 0,
      keptInUseRecipes: 0,
    };

    // 1. Purge long-deleted recipes first, so their photos sweep in this run.
    if (!dryRun) {
      try {
        const purge = await references.purgeSoftDeletedRecipes(
          new Date(now.getTime() - SOFT_DELETE_PURGE_DAYS * DAY_MS),
          MAX_PURGE_PER_RUN,
        );
        result.purgedRecipes = purge.purged;
        result.keptInUseRecipes = purge.keptInUse;
      } catch (err) {
        // The file sweep still runs: an unpurged recipe only keeps its photo.
        logger.error({ err }, 'uploads.sweep: recipe purge failed');
      }
    }

    // 2. Orphan files. A failed reference query throws — nothing is deleted.
    // The ledger is read BEFORE the disk, so an upload landing mid-sweep is
    // never mistaken for a row whose file is missing.
    const referenced = await referencedUploadPaths(references);
    const ledgerNames = await ledger.allFileNames();
    const files = await listManagedFiles(dir);
    result.scanned = files.length;
    const gone = new Set<string>();
    for (const file of files) {
      if (referenced.has(file.rel)) {
        result.referenced += 1;
        continue;
      }
      if (now.getTime() - file.mtimeMs < ORPHAN_MIN_AGE_MS) {
        result.young += 1;
        continue;
      }
      if (!dryRun) {
        try {
          await rm(path.join(dir, file.rel), { force: true });
        } catch (err) {
          logger.warn({ err, file: file.rel }, 'uploads.sweep: could not delete file');
          continue;
        }
      }
      gone.add(file.rel);
      result.deleted += 1;
      result.bytesFreed += file.size;
    }

    // 3. Ledger rows whose file no longer exists (swept now, or lost earlier).
    const onDisk = new Set(files.map((f) => f.rel).filter((rel) => !gone.has(rel)));
    const staleRows = ledgerNames.filter((name) => !onDisk.has(name));
    result.ledgerRowsDeleted = dryRun
      ? staleRows.length
      : await ledger.deleteByFileNames(staleRows);

    logger.info(result, 'uploads.sweep');
    return result;
  }
}

export const uploadSweeperWorker = new UploadSweeperWorker();
