/**
 * generate-exercise-photos.ts (WP-25 lane x — "complete media")
 *
 * AI-renders the start/end photos of every exercise listed in
 * exercise-photo-prompts.ts (the ones with no free-exercise-db or openly licensed
 * photo), converts them to the catalog format (600×400 WebP, see photo-lib.ts) and
 * records prompt + seed per frame in docs/gym/exercise-photo-sources.json.
 *
 * Providers (all free, no API key, no account):
 *   horde         (default) AI Horde (stablehorde.net), crowd-sourced Stable Diffusion
 *                 workers, anonymous key. Anonymous requests must stay <= 576x576, so
 *                 renders are 576x384 (3:2) and scaled to 600×400. Default model
 *                 "Flux.1-Schnell fp8 (Compact)" (Apache-2.0, follows poses far better
 *                 than SD 1.5 "Deliberate", which only gave portrait close-ups). All jobs
 *                 are submitted at once; anonymous priority is lowest, so a full run
 *                 takes ~20-40 min of queueing. --model switches model.
 *   hf            the public black-forest-labs/FLUX.1-schnell Hugging Face Space (better
 *                 images, but the anonymous ZeroGPU quota ran out after ~3 renders).
 *   pollinations  https://image.pollinations.ai. Since 2026-10 the anonymous tier answers
 *                 402 (payment required) to every new prompt, so it only works when the
 *                 prompt is already cached; bottom 40 px are trimmed for its logo.
 *
 * Usage (repo root):
 *   cd apps/api && pnpm exec tsx ../../scripts/gym/generate-exercise-photos.ts [flags]
 *
 *   --only a,b        only these slugs
 *   --force           re-render files that already exist
 *   --reseed N        with --force: seed family N (default 0) — try 1, 2, ... when a
 *                     render is anatomically wrong or shows the wrong equipment
 *   --frame 0|1       with --force: only re-render this frame
 *   --provider p      horde | hf | pollinations
 *   --model name      horde model (default Deliberate)
 *   --candidates n    render n (1-4) candidates per frame (horde: one job, n images); the
 *                     first is installed, all are cached in ~/Library/Caches/chefer-exercise-photos
 *   --cache-only      render and cache only, do not touch apps/api/static/exercises
 *   --use s:f:tag     install a cached candidate (slug:frame:tag, comma separated) after
 *                     looking at the candidates; tags are printed per frame as s<seed>-<n>
 *   --concurrency n   parallel renders (default: all at once on horde)
 *   --dry-run         print the prompts, render nothing
 *
 * Idempotent: a slug whose two files exist is skipped. ALWAYS look at the result
 * (exercise-photo-contact-sheet.ts) — AI renders get extra limbs and wrong gear.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { exercisePhotoFile } from '@chefer/types';
import { AI_EXERCISE_IDS, NEGATIVE_PROMPT, promptFor } from './exercise-photo-prompts';
import {
  flag,
  onlyList,
  option,
  OUT_DIR,
  readManifest,
  sleep,
  toCatalogWebp,
  writeManifest,
  type PhotoFrameSource,
  type PhotoSourceEntry,
} from './photo-lib';

type Provider = 'horde' | 'hf' | 'pollinations';
const PROVIDER: Provider = ((): Provider => {
  const p = option('--provider');
  return p === 'hf' || p === 'pollinations' ? p : 'horde';
})();
const HORDE_MODEL = option('--model') ?? 'Flux.1-Schnell fp8 (Compact)';
const IS_FLUX = HORDE_MODEL.toLowerCase().includes('flux');
const FORCE = flag('--force');
const DRY = flag('--dry-run');
const RESEED = Number(option('--reseed') ?? 0) || 0;
const ONLY_FRAME = option('--frame') === '0' ? 0 : option('--frame') === '1' ? 1 : undefined;
const CANDIDATES = Math.max(1, Math.min(4, Number(option('--candidates') ?? 1) || 1));
const USE = option('--use');
const CACHE_ONLY = flag('--cache-only');
const CONCURRENCY = Math.max(
  1,
  Number(option('--concurrency') ?? (PROVIDER === 'horde' ? 100 : 1)),
);
const RAW_DIR = join(homedir(), 'Library', 'Caches', 'chefer-exercise-photos');
const HF_BASE = 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api';
const HORDE_BASE = 'https://stablehorde.net/api/v2';
const MAX_ATTEMPTS = 200;

/** Render size per provider: horde anonymous tier caps at 576x576; others 768x512. All 3:2. */
const SIZE = PROVIDER === 'horde' ? { w: 576, h: 384 } : { w: 768, h: 512 };

function seedFor(id: string): number {
  let h = 5381;
  for (const c of id) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return (h % 900_000) + RESEED * 7919;
}

let nextSubmit = 0;
/** Horde answers 429 above 2 submits per second; space them out. */
async function paceSubmit(): Promise<void> {
  const start = Math.max(Date.now(), nextSubmit);
  nextSubmit = start + 800;
  if (start > Date.now()) await sleep(start - Date.now());
}

type Render = { buf: Buffer; seed: number };

const JOBS_FILE = join(RAW_DIR, 'horde-jobs.json');
type JobState = Record<string, string>;
function readJobs(): JobState {
  return existsSync(JOBS_FILE) ? (JSON.parse(readFileSync(JOBS_FILE, 'utf8')) as JobState) : {};
}
/** Job ids survive a restart of this script: anonymous Horde jobs can queue for an hour. */
function setJob(key: string, id: string | null): void {
  const jobs = readJobs();
  if (id) jobs[key] = id;
  else delete jobs[key];
  writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 1));
}

async function submitHorde(prompt: string, seed: number): Promise<string> {
  await paceSubmit();
  const submit = await fetch(`${HORDE_BASE}/generate/async`, {
    method: 'POST',
    headers: {
      apikey: '0000000000',
      'Content-Type': 'application/json',
      'Client-Agent': 'chefer-exercise-photos:1:popdanvlad87@gmail.com',
    },
    body: JSON.stringify({
      // Flux follows plain sentences and ignores negatives; SD 1.5/SDXL want a negative prompt.
      prompt: IS_FLUX ? prompt : `${prompt} ### ${NEGATIVE_PROMPT}`,
      params: {
        width: SIZE.w,
        height: SIZE.h,
        steps: IS_FLUX ? 8 : 30,
        n: CANDIDATES,
        cfg_scale: IS_FLUX ? 1 : 6.5,
        sampler_name: IS_FLUX ? 'k_euler' : 'k_euler_a',
        seed: String(seed),
      },
      nsfw: false,
      models: [HORDE_MODEL],
      r2: true,
      shared: false,
      ttl: 21_600, // anonymous jobs wait long; the default 20 min TTL expires them unserved
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!submit.ok)
    throw new Error(`Horde submit HTTP ${submit.status}: ${(await submit.text()).slice(0, 120)}`);
  return ((await submit.json()) as { id: string }).id;
}

async function renderHorde(prompt: string, seed: number, key: string): Promise<Render[]> {
  let id = readJobs()[key];
  if (!id) {
    id = await submitHorde(prompt, seed);
    setJob(key, id);
  }
  // No client-side timeout: an anonymous job waits behind everyone else's, and
  // cancelling + resubmitting sends it to the back of the queue again.
  for (let i = 0; i < 4 * 60 * 6; i++) {
    await sleep(15_000 + Math.random() * 5_000);
    const res = await fetch(`${HORDE_BASE}/generate/status/${id}`, {
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) continue;
    if (res.status === 404) {
      setJob(key, null); // expired on the Horde side: resubmit
      throw new Error('Horde job expired');
    }
    if (!res.ok) continue;
    const status = (await res.json()) as {
      done: boolean;
      faulted: boolean;
      generations?: { img: string; seed?: string; censored?: boolean }[];
    };
    if (status.faulted) {
      setJob(key, null);
      throw new Error('Horde job faulted');
    }
    if (status.done) {
      setJob(key, null);
      const gens = (status.generations ?? []).filter((x) => !x.censored);
      if (gens.length === 0) throw new Error('Horde returned no image (all censored)');
      const out: Render[] = [];
      for (const gen of gens) {
        const img = await fetch(gen.img, { signal: AbortSignal.timeout(60_000) });
        if (!img.ok) throw new Error(`Horde download HTTP ${img.status}`);
        out.push({ buf: Buffer.from(await img.arrayBuffer()), seed: Number(gen.seed ?? seed) });
      }
      return out;
    }
  }
  throw new Error('Horde job still queued after 6 h');
}

async function renderHf(prompt: string, seed: number): Promise<Render[]> {
  const submit = await fetch(`${HF_BASE}/call/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [prompt, seed, false, SIZE.w, SIZE.h, 4] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!submit.ok) throw new Error(`HF submit HTTP ${submit.status}`);
  const { event_id } = (await submit.json()) as { event_id: string };
  const stream = await fetch(`${HF_BASE}/call/infer/${event_id}`, {
    signal: AbortSignal.timeout(180_000),
  });
  const text = await stream.text();
  const complete = /event: complete\s+data: (.*)/.exec(text);
  if (!complete?.[1])
    throw new Error(`HF render failed (quota?): ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
  const [file] = JSON.parse(complete[1]) as [{ url: string }];
  const img = await fetch(file.url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`HF download HTTP ${img.status}`);
  return [{ buf: Buffer.from(await img.arrayBuffer()), seed }];
}

async function renderPollinations(prompt: string, seed: number): Promise<Render[]> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${SIZE.w}&height=${SIZE.h}&seed=${seed}&nologo=true&model=flux`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  const buf = Buffer.from(await res.arrayBuffer());
  if (
    !res.ok ||
    !(res.headers.get('content-type') ?? '').startsWith('image/') ||
    buf.length < 2000
  ) {
    throw new Error(`Pollinations HTTP ${res.status}`);
  }
  return [{ buf, seed }];
}

async function render(prompt: string, seed: number, key: string): Promise<Render[]> {
  let last = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const s = seed + (attempt - 1) * 131; // a censored/odd seed is not retried as is
      if (PROVIDER === 'horde') return await renderHorde(prompt, s, key);
      if (PROVIDER === 'hf') return await renderHf(prompt, s);
      return await renderPollinations(prompt, s);
    } catch (err) {
      last = (err as Error).message;
      const wait = Math.min(120_000, 10_000 * attempt);
      console.log(
        `    attempt ${attempt} failed (${last.slice(0, 160)}); waiting ${Math.round(wait / 1000)}s`,
      );
      await sleep(wait);
    }
  }
  throw new Error(`${PROVIDER} kept failing: ${last}`);
}

type Task = { id: string; frame: 0 | 1 };

async function runPool(tasks: Task[], worker: (t: Task) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
      while (next < tasks.length) {
        const t = tasks[next++];
        if (t) await worker(t);
      }
    }),
  );
}

/** Cached render: `<slug>-<frame>-<tag>.webp`, tag = `s<seed>-<index>` (index 1-based). */
const candidateFile = (id: string, frame: 0 | 1, tag: string): string =>
  join(RAW_DIR, `${id}-${frame}-${tag}.webp`);

const generator =
  PROVIDER === 'horde'
    ? `ai-horde/${HORDE_MODEL}`
    : PROVIDER === 'hf'
      ? 'huggingface-space/FLUX.1-schnell'
      : 'pollinations/flux';

/** Converts a cached render to the catalog file and records prompt + seed. */
function install(id: string, frame: 0 | 1, tag: string): void {
  const src = candidateFile(id, frame, tag);
  const seed = Number(/^s(\d+)/.exec(tag)?.[1] ?? 0);
  if (!existsSync(src)) throw new Error(`no cached render ${src} (render it first)`);
  const file = exercisePhotoFile(id, frame);
  toCatalogWebp(src, join(OUT_DIR, file), {
    trimBottomPx: PROVIDER === 'pollinations' ? 40 : 0,
  });
  const manifest = readManifest();
  const prev = manifest[id];
  const frames: [PhotoFrameSource, PhotoFrameSource] =
    prev?.source === 'ai'
      ? [...prev.frames]
      : [{ file: exercisePhotoFile(id, 0) }, { file: exercisePhotoFile(id, 1) }];
  const candidate = Number(/-(\d+)$/.exec(tag)?.[1] ?? 1);
  frames[frame] = { file, prompt: promptFor(id, frame) ?? '', seed, candidate };
  const entry: PhotoSourceEntry = { source: 'ai', generator: prev?.generator ?? generator, frames };
  manifest[id] = { ...entry, generator };
  writeManifest(manifest);
}

async function main(): Promise<void> {
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  if (USE) {
    // --use slug:frame:tag[,slug:frame:tag...] installs cached candidates, e.g. after
    // looking at a --candidates 3 run (tags are printed as "done ... tags s123-1,s123-2").
    for (const spec of USE.split(',')) {
      const [id, frame, tag] = spec.split(':');
      if (!id || (frame !== '0' && frame !== '1') || !tag) throw new Error(`bad --use ${spec}`);
      install(id, frame === '0' ? 0 : 1, tag);
      console.log(`installed ${id} frame ${frame} (${tag})`);
    }
    return;
  }

  const only = onlyList();
  const tasks: Task[] = [];
  for (const id of AI_EXERCISE_IDS) {
    if (only && !only.includes(id)) continue;
    for (const frame of [0, 1] as const) {
      const exists = existsSync(join(OUT_DIR, exercisePhotoFile(id, frame)));
      // cache-only: this seed family is already rendered and cached
      if (CACHE_ONLY && !FORCE && existsSync(candidateFile(id, frame, `s${seedFor(id)}-1`)))
        continue;
      if (
        CACHE_ONLY
          ? ONLY_FRAME !== undefined && frame !== ONLY_FRAME
          : FORCE
            ? ONLY_FRAME !== undefined && frame !== ONLY_FRAME
            : exists
      )
        continue;
      tasks.push({ id, frame });
    }
  }
  console.log(
    `${tasks.length} frame(s) x ${CANDIDATES} candidate(s) to render with ${PROVIDER}` +
      (PROVIDER === 'horde' ? ` (${HORDE_MODEL})` : ''),
  );

  let rendered = 0;
  await runPool(tasks, async ({ id, frame }) => {
    const seed = seedFor(id);
    const prompt = promptFor(id, frame) ?? '';
    if (DRY) {
      console.log(`${id} frame ${frame} (seed ${seed})\n  ${prompt}`);
      return;
    }
    try {
      const renders = await render(
        prompt,
        seed,
        `${id}:${frame}:${RESEED}:${CANDIDATES}:${HORDE_MODEL}`,
      );
      const tags = renders.map((r, k) => `s${r.seed}-${k + 1}`);
      renders.forEach((r, k) => writeFileSync(candidateFile(id, frame, tags[k] ?? ''), r.buf));
      // Candidate 1 is the default; --use swaps it. --cache-only just keeps the renders.
      if (!CACHE_ONLY && tags[0]) install(id, frame, tags[0]);
      rendered++;
      console.log(`done ${id} frame ${frame} tags ${tags.join(',')}`);
    } catch (err) {
      console.error(`FAILED ${id} frame ${frame}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });
  console.log(`\nRendered ${rendered} frame(s) with ${PROVIDER}. Renders cached in ${RAW_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
