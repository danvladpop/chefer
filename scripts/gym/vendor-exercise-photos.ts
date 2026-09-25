/**
 * vendor-exercise-photos.ts (gym_plan.md G0-4 / §5.5)
 *
 * Downloads the start/end JPGs for every gym catalog exercise that has a
 * `freeExerciseDbId`, converts them to WebP at max 600px wide, and writes
 * them to apps/api/static/exercises/<slug>-{0,1}.webp so the API can serve
 * them offline-safe (not hot-linked from raw.githubusercontent.com at
 * runtime — see docs/gym/exercise-library-research.md Part 1).
 *
 * Source: https://github.com/yuhonas/free-exercise-db — The Unlicense
 * (public domain, no attribution required). See
 * apps/api/static/exercises/README.md for the license note.
 *
 * Requires `cwebp` on PATH (brew install webp), or set CWEBP_BIN to its
 * absolute path.
 *
 * Usage (from the repo root):
 *   cd apps/api && pnpm exec tsx ../../scripts/gym/vendor-exercise-photos.ts [--force]
 *
 * Idempotent: skips any <slug>-<frame>.webp that already exists, unless
 * --force is passed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISE_CATALOG } from '@chefer/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FORCE = process.argv.includes('--force');
const CWEBP_BIN = process.env['CWEBP_BIN'] ?? 'cwebp';
const OUT_DIR = join(__dirname, '..', '..', 'apps', 'api', 'static', 'exercises');
const BASE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const FRAMES = [0, 1] as const;

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

function convertToWebp(inputPath: string, outputPath: string): void {
  execFileSync(CWEBP_BIN, ['-q', '78', '-resize', '600', '0', inputPath, '-o', outputPath], {
    stdio: 'pipe',
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const entries = EXERCISE_CATALOG.filter((e) => e.freeExerciseDbId);
  console.log(
    `Vendoring photos for ${entries.length}/${EXERCISE_CATALOG.length} catalog exercises` +
      ` that have a freeExerciseDbId${FORCE ? ' (--force)' : ''}...\n`,
  );

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const failedSlugs: string[] = [];

  for (const entry of entries) {
    const dbId = entry.freeExerciseDbId;
    if (!dbId) continue;

    for (const frame of FRAMES) {
      const outPath = join(OUT_DIR, `${entry.id}-${frame}.webp`);
      if (existsSync(outPath) && !FORCE) {
        skipped++;
        continue;
      }

      const tmpPath = join(tmpdir(), `gym-photo-${entry.id}-${frame}-${process.pid}.jpg`);
      const url = `${BASE_URL}/${dbId}/${frame}.jpg`;
      try {
        await downloadToFile(url, tmpPath);
        convertToWebp(tmpPath, outPath);
        downloaded++;
        console.log(`  ok  ${entry.id}-${frame}.webp`);
      } catch (err) {
        failed++;
        failedSlugs.push(`${entry.id}-${frame}`);
        console.error(`  FAIL  ${entry.id}-${frame}: ${(err as Error).message}`);
      } finally {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      }
    }
  }

  let totalBytes = 0;
  for (const entry of entries) {
    for (const frame of FRAMES) {
      const outPath = join(OUT_DIR, `${entry.id}-${frame}.webp`);
      if (existsSync(outPath)) totalBytes += statSync(outPath).size;
    }
  }

  console.log(
    `\nDownloaded ${downloaded}, skipped ${skipped} (already existed), failed ${failed}.` +
      `\nTotal size of apps/api/static/exercises: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
  );
  if (failedSlugs.length) {
    console.log(`Failed: ${failedSlugs.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
