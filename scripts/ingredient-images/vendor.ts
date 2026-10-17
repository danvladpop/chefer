/**
 * vendor.ts — pre-render ingredient thumbnails into apps/api/static/ingredients
 * (WP-24 / FB7-10 "many ingredients don't have an image").
 *
 * Why: the shopping list used on-demand Pollinations URLs; cold renders fail
 * (HTTP 402 under load) or time out on phones, leaving blank thumbnails. This
 * renders each product shot ONCE with the deterministic prompt
 * (scripts/ingredient-images/prompt.ts), crops off Pollinations' anonymous-tier
 * watermark, and stores a 256×256 webp the API serves itself
 * (apps/api/src/lib/ingredient-images/static-images.ts).
 *
 * Usage (from the repo root, like scripts/gym):
 *   cd apps/api && pnpm exec tsx ../../scripts/ingredient-images/vendor.ts [flags]
 *
 *   --scope used|all   used (default): ingredients of the curated recipe pool;
 *                      all: ∪ every catalog ingredient
 *   --only a,b         only these canonical keys (space or dash form, comma list)
 *   --force            re-render files that already exist
 *   --reseed           with --force: use a different seed (prompt unchanged)
 *   --concurrency n    parallel render loops (default 1)
 *   --gap-ms n         minimum ms between request starts, across workers (default 12000)
 *   --dry-run          print the target list, render nothing
 *
 * Idempotent: existing files are skipped (their manifest entry is kept, names
 * refreshed). Requires `cwebp` (brew install webp) and macOS `sips`.
 * Pollinations' anonymous tier answers 402 to bursts (measured 2026-10: a retry
 * every 2 s fails ~90 %, a request every ~12 s succeeds ~40 % — about one image
 * per 30 s sustained, so ~200 images take ~1.7 h). Hence one worker and a
 * paced gap; re-run to retry failures, finished files are skipped.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSkippedLine } from '../../apps/api/src/application/shopping-list/aggregate';
import { CURATED_POOL_BY_TYPE } from '../../apps/api/src/lib/curated-recipes/index';
import { buildPollinationsUrl } from '../../apps/api/src/lib/image-gen/pollinations';
import type {
  IngredientImageManifest,
  IngredientImageManifestEntry,
} from '../../apps/api/src/lib/ingredient-images/static-images';
import { productShotPrompt } from './prompt';
import { buildTargets, type RecipeLine, type Target } from './targets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'apps', 'api', 'static', 'ingredients');
const MANIFEST_FILE = join(OUT_DIR, 'manifest.json');
const CWEBP_BIN = process.env['CWEBP_BIN'] ?? 'cwebp';

/** Render at 512 (better detail), then crop away the watermark strip and downscale. */
const RENDER_PX = 512;
/** Centered square crop: the logo sits in the bottom ~32 px, so 440 keeps the middle 86 %. */
const CROP_PX = 440;
const OUT_PX = 256;
const WEBP_QUALITY = '70';
const MAX_ATTEMPTS = 12;

function flag(name: string): boolean {
  return process.argv.includes(name);
}
function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const FORCE = flag('--force');
const CONCURRENCY = Math.max(1, Number(option('--concurrency') ?? 1) || 1);
const RESEED = flag('--reseed');
const DRY = flag('--dry-run');
const SCOPE = option('--scope') === 'all' ? 'all' : 'used';
const ONLY = option('--only')
  ?.split(',')
  .map((k) => k.trim().toLowerCase().replace(/-/g, ' '))
  .filter(Boolean);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function readManifest(): IngredientImageManifest {
  if (!existsSync(MANIFEST_FILE)) return { version: 1, entries: {} };
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as IngredientImageManifest;
}

/** All requests start at least MIN_GAP_MS apart, across workers (see the header). */
const MIN_GAP_MS = Number(option('--gap-ms') ?? 12000);
let nextSlot = 0;
async function pace(): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + MIN_GAP_MS;
  if (start > now) await sleep(start - now);
}

/** Downloads the JPG for a prompt, retrying through Pollinations' transient 402/429/5xx. */
async function download(url: string, dest: string): Promise<void> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await pace();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      lastStatus = res.status;
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 2000) {
          writeFileSync(dest, buf);
          return;
        }
      }
    } catch {
      lastStatus = -1;
    }
  }
  throw new Error(`Pollinations kept failing (last status ${lastStatus})`);
}

function render(target: Target, seedSuffix: string): { prompt: string; url: string; jpg: string } {
  const prompt = productShotPrompt(
    target.subject.length > 0 ? target.subject : target.key,
    target.key,
  );
  const url = buildPollinationsUrl(
    prompt,
    target.key + seedSuffix,
    'ingredient',
    RENDER_PX,
    RENDER_PX,
  );
  const jpg = join(tmpdir(), `ingredient-${process.pid}-${target.file}.jpg`);
  return { prompt, url, jpg };
}

function toWebp(srcJpg: string, outWebp: string): void {
  const cropped = `${srcJpg}.crop.jpg`;
  const small = `${srcJpg}.small.jpg`;
  try {
    execFileSync(
      'sips',
      ['--cropToHeightWidth', String(CROP_PX), String(CROP_PX), srcJpg, '--out', cropped],
      { stdio: 'pipe' },
    );
    execFileSync(
      'sips',
      ['--resampleHeightWidth', String(OUT_PX), String(OUT_PX), cropped, '--out', small],
      { stdio: 'pipe' },
    );
    execFileSync(CWEBP_BIN, ['-q', WEBP_QUALITY, small, '-o', outWebp], { stdio: 'pipe' });
  } finally {
    for (const f of [cropped, small]) if (existsSync(f)) unlinkSync(f);
  }
}

const hashOf = (file: string): string =>
  createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);

async function main(): Promise<void> {
  const recipeLines: RecipeLine[] = Object.values(CURATED_POOL_BY_TYPE)
    .flat()
    .flatMap((r) => r.ingredients.map((i) => ({ name: i.name, slug: i.slug })));
  const skip = (name: string): boolean => isSkippedLine(name, '');
  let targets = buildTargets({ scope: SCOPE, recipeLines, skip });
  if (ONLY) targets = targets.filter((t) => ONLY.includes(t.key));

  console.log(`scope=${SCOPE}: ${targets.length} targets${ONLY ? ` (--only ${ONLY.length})` : ''}`);
  if (DRY) {
    for (const t of targets) {
      console.log(
        `${t.key.padEnd(40)} ${t.file}.webp  [${t.origin}]  subject="${t.subject}"  names=${t.names.length}`,
      );
    }
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = readManifest();
  const today = new Date().toISOString().slice(0, 10);
  let made = 0;
  let skipped = 0;
  const failed: string[] = [];

  const processOne = async (target: Target, i: number): Promise<void> => {
    const outPath = join(OUT_DIR, `${target.file}.webp`);
    const previous = manifest.entries[target.key];
    if (existsSync(outPath) && previous && !FORCE) {
      previous.names = target.names;
      skipped++;
      return;
    }
    // --force --reseed: bump the seed version recorded in `source` ("… seed-v2").
    const version = Number(/seed-v(\d+)$/.exec(previous?.source ?? '')?.[1] ?? 1);
    const seedSuffix = FORCE && RESEED ? ` v${version + 1}` : '';
    const { prompt, url, jpg } = render(target, seedSuffix);
    try {
      await download(url, jpg);
      toWebp(jpg, outPath);
      manifest.entries[target.key] = {
        file: `${target.file}.webp`,
        hash: hashOf(outPath),
        names: target.names,
        subject: target.subject,
        prompt,
        source: `pollinations/flux${seedSuffix ? ` seed${seedSuffix.replace(' ', '-')}` : ''}`,
        date: today,
      };
      made++;
      console.log(`[${i + 1}/${targets.length}] ok   ${target.key} (${statSync(outPath).size} B)`);
      // Persist progress so an interrupted run resumes cheaply.
      writeManifest(manifest);
    } catch (err) {
      failed.push(target.key);
      console.error(`[${i + 1}/${targets.length}] FAIL ${target.key}: ${(err as Error).message}`);
    } finally {
      if (existsSync(jpg)) unlinkSync(jpg);
    }
  };

  // A few workers share one queue: Pollinations answers 402 to most anonymous
  // requests under load (a retry usually clears it), so parallel retry loops
  // raise throughput without a request stampede.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < targets.length) {
      const i = next++;
      await processOne(targets[i] as Target, i);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeManifest(manifest);
  let bytes = 0;
  for (const e of Object.values(manifest.entries)) {
    const f = join(OUT_DIR, e.file);
    if (existsSync(f)) bytes += statSync(f).size;
  }
  console.log(
    `\nrendered ${made}, skipped ${skipped}, failed ${failed.length}. ` +
      `${Object.keys(manifest.entries).length} manifest entries, ${(bytes / 1024 / 1024).toFixed(2)} MB total.`,
  );
  if (failed.length) {
    console.log(`Failed (re-run to retry): ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

function writeManifest(manifest: IngredientImageManifest): void {
  const sorted: IngredientImageManifest = {
    version: 1,
    entries: Object.fromEntries(
      Object.entries(manifest.entries).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  writeFileSync(MANIFEST_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
