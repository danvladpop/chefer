/**
 * extract-video-recipes.ts
 *
 * Batch driver for the two-stage short-video recipe extractor — the tool that
 * builds Chefer's CURATED recipe dataset from cooking reels/Shorts/TikToks.
 *
 * It exists to answer one question that decides the economics of the dataset:
 * WHAT FRACTION OF CLIPS ESCALATE? Stage 1 (caption only) costs ~550 input
 * tokens and no bandwidth; stage 2 (the clip) costs ~20,000 and a download an
 * order of magnitude larger. The escalation rate is the multiplier on both, so
 * this script reports it per run rather than leaving it to be assumed.
 *
 * Nothing is written to the database. Output is a JSON file for the review
 * queue — an unreviewed extraction must never reach the shared pool.
 *
 * Usage:
 *   pnpm recipes:from-video <url> [url…]
 *   pnpm recipes:from-video --file reels.txt --out drafts.json
 *
 * Options:
 *   --file <path>   newline-delimited URLs ("#" comments and blanks ignored)
 *   --out <path>    where to write the drafts   (default: video-recipes.json)
 *   --delay <ms>    pause between clips         (default: 1500)
 */

import { readFile, writeFile } from 'node:fs/promises';
import {
  videoRecipeService,
  type VideoRecipeResult,
} from '../apps/api/src/application/video-import/video-recipe.service.js';

interface Options {
  urls: string[];
  out: string;
  delayMs: number;
}

function parseArgs(argv: string[]): { file: string | null; options: Options } {
  const urls: string[] = [];
  let file: string | null = null;
  let out = 'video-recipes.json';
  let delayMs = 1500;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') file = argv[(i += 1)] ?? null;
    else if (arg === '--out') out = argv[(i += 1)] ?? out;
    else if (arg === '--delay') delayMs = Number(argv[(i += 1)] ?? delayMs);
    else if (arg && !arg.startsWith('--')) urls.push(arg);
  }
  return { file, options: { urls, out, delayMs } };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Draft extends VideoRecipeResult {
  extractedAt: string;
}

interface Failure {
  url: string;
  error: string;
}

async function main(): Promise<void> {
  const { file, options } = parseArgs(process.argv.slice(2));

  const urls = [...options.urls];
  if (file) {
    const lines = (await readFile(file, 'utf8'))
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    urls.push(...lines);
  }

  if (urls.length === 0) {
    console.error('No URLs. Pass them as arguments or via --file <path>.');
    process.exitCode = 1;
    return;
  }

  console.error(`\nExtracting ${urls.length} clip(s)…\n`);

  const drafts: Draft[] = [];
  const failures: Failure[] = [];

  for (const [index, url] of urls.entries()) {
    const label = `[${index + 1}/${urls.length}]`;
    const started = Date.now();
    try {
      const result = await videoRecipeService.extract(url);
      drafts.push({ ...result, extractedAt: new Date().toISOString() });

      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const stage = result.stage === 'caption' ? 'caption ' : 'VIDEO   ';
      console.error(
        `${label} ${stage} ${secs}s  ${result.recipe.name} ` +
          `(${result.recipe.ingredients.length} ingredients, ` +
          `${result.recipe.instructions.length} steps, ${result.confidence} confidence)`,
      );
      if (result.escalationReason) console.error(`        ↳ escalated: ${result.escalationReason}`);
      if (result.renames.length) console.error(`        ↳ renamed: ${result.renames.join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ url, error: message });
      console.error(`${label} FAILED   ${url}\n        ↳ ${message}`);
    }

    // Deliberate pacing: these are third-party endpoints, and hammering them
    // is both rude and the fastest way to get rate-limited out of a batch.
    if (index < urls.length - 1) await sleep(options.delayMs);
  }

  await writeFile(options.out, JSON.stringify({ drafts, failures }, null, 2), 'utf8');

  // ── The number this script exists to produce ──────────────────────────────
  const escalated = drafts.filter((d) => d.stage === 'video').length;
  const captionOnly = drafts.length - escalated;
  const rate = drafts.length ? Math.round((escalated / drafts.length) * 100) : 0;

  console.error(`\n${'─'.repeat(60)}`);
  console.error(`  extracted        ${drafts.length}/${urls.length}`);
  console.error(`  caption only     ${captionOnly}  (~550 input tokens each)`);
  console.error(`  escalated        ${escalated}  (~20,000 input tokens each)`);
  console.error(`  ESCALATION RATE  ${rate}%`);
  if (failures.length) console.error(`  failed           ${failures.length}`);
  const lowConfidence = drafts.filter((d) => d.confidence === 'low').length;
  if (lowConfidence) console.error(`  low confidence   ${lowConfidence}  — review these first`);
  console.error(`${'─'.repeat(60)}`);
  console.error(`\nDrafts written to ${options.out}. Review before promoting to CURATED.\n`);

  if (failures.length === urls.length) process.exitCode = 1;
}

// Not top-level await: the repo root is CJS, so scripts/ transpiles as CJS.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
