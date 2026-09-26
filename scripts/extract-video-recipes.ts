/**
 * extract-video-recipes.ts
 *
 * Batch driver for the video-link recipe extractor — the tool that builds
 * Chefer's CURATED recipe dataset from cooking reels/Shorts/TikToks.
 *
 * Same pipeline as the in-app "From a video link" import
 * (application/video-import/video-recipe.service.ts): the recipe is read from
 * the video's WORDS — its caption, else its subtitles, else a Whisper
 * transcript of the audio — through the ordinary text extraction. No model is
 * sent video. The per-run breakdown shows how often each source was needed:
 * the speech step is the only one that downloads media and costs Whisper time.
 *
 * Nothing is written to the database. Output is a JSON file for the review
 * queue — an unreviewed extraction must never reach the shared pool.
 *
 * Needs yt-dlp + ffmpeg on PATH (`brew install yt-dlp ffmpeg`), and
 * AI_MOCK_ENABLED=false with AI_SECONDARY_API_KEY set for the speech step.
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
      console.error(
        `${label} ${result.stage.padEnd(9)} ${secs}s  ${result.recipe.name || '(no name)'} ` +
          `(${result.recipe.ingredients.length} ingredients, ` +
          `${result.recipe.instructions.length} steps, ${result.confidence} confidence)`,
      );
      if (result.recipe.instructions.length === 0) {
        console.error('        ↳ no method in the words — fill it in during review');
      }
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

  // ── Which words carried the recipes ───────────────────────────────────────
  const count = (stage: Draft['stage']) => drafts.filter((d) => d.stage === stage).length;
  const speech = count('speech');
  const rate = drafts.length ? Math.round((speech / drafts.length) * 100) : 0;

  console.error(`\n${'─'.repeat(60)}`);
  console.error(`  extracted        ${drafts.length}/${urls.length}`);
  console.error(`  caption          ${count('caption')}  (metadata only)`);
  console.error(`  subtitles        ${count('subtitles')}  (a few KB of text)`);
  console.error(`  speech           ${speech}  (audio download + Whisper)`);
  console.error(`  SPEECH RATE      ${rate}%`);
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
