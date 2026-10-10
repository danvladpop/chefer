/**
 * photo-lib.ts — shared helpers for the exercise photo scripts (WP-25 lane x).
 *
 * Every exercise photo is a "cover" crop to exactly 600×400 (3:2), WebP q80,
 * written under apps/api/static/exercises/ with the name from
 * `exercisePhotoFile` (@chefer/types). Provenance of every photo that does NOT
 * come from free-exercise-db lives in docs/gym/exercise-photo-sources.json
 * (see PhotoSourceEntry), which the README credits table is built from.
 *
 * Needs `cwebp`/`dwebp` (brew install webp) and macOS `sips`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(here, '..', '..', 'apps', 'api', 'static', 'exercises');
export const MANIFEST_FILE = join(here, '..', '..', 'docs', 'gym', 'exercise-photo-sources.json');
export const TARGET_W = 600;
export const TARGET_H = 400;
const CWEBP_BIN = process.env['CWEBP_BIN'] ?? 'cwebp';
const DWEBP_BIN = process.env['DWEBP_BIN'] ?? 'dwebp';

export type PhotoFrameSource = {
  /** Output file name (the image key). */
  file: string;
  /** commons: file page URL. ai: provider call. */
  sourceUrl?: string;
  author?: string;
  license?: string;
  /** ai: the exact prompt and seed, so a frame can be re-rendered. */
  prompt?: string;
  seed?: number;
  /** ai: which of the n images of the job (request n=3 with this seed); 1-based. */
  candidate?: number;
};

export type PhotoSourceEntry = {
  source: 'commons' | 'ai';
  /** ai: "<provider>/<model>". */
  generator?: string;
  frames: [PhotoFrameSource, PhotoFrameSource];
  /** Free text, e.g. why a single scene photo stands in for the movement. */
  note?: string;
};

export type PhotoManifest = Record<string, PhotoSourceEntry>;

export function readManifest(): PhotoManifest {
  if (!existsSync(MANIFEST_FILE)) return {};
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as PhotoManifest;
}

export function writeManifest(m: PhotoManifest): void {
  mkdirSync(dirname(MANIFEST_FILE), { recursive: true });
  const sorted: PhotoManifest = {};
  for (const k of Object.keys(m).sort()) {
    const v = m[k];
    if (v) sorted[k] = v;
  }
  writeFileSync(MANIFEST_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

function dims(path: string): { width: number; height: number } {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], {
    stdio: 'pipe',
  }).toString();
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
  if (!width || !height) throw new Error(`sips could not read ${path}`);
  return { width, height };
}

export type Crop = {
  /** Where the 600×400 window sits in the overflow, 0 = left/top, 1 = right/bottom. Default 0.5. */
  focusX?: number;
  focusY?: number;
  /** Remove this many source pixels from the bottom first (e.g. a provider logo). */
  trimBottomPx?: number;
};

/**
 * Converts any jpg/png/webp to the catalog format: decode, optional trim, scale
 * up/down preserving aspect so both sides are >= target, crop the window, WebP q80.
 */
export function toCatalogWebp(src: string, outWebp: string, crop: Crop = {}): void {
  const tmps: string[] = [];
  const tmp = (suffix: string): string => {
    const p = join(tmpdir(), `gym-photo-${process.pid}-${Date.now()}-${tmps.length}${suffix}`);
    tmps.push(p);
    return p;
  };
  try {
    let current = src;
    if (src.toLowerCase().endsWith('.webp')) {
      const png = tmp('.png');
      execFileSync(DWEBP_BIN, [src, '-o', png], { stdio: 'pipe' });
      current = png;
    }
    if (crop.trimBottomPx) {
      const { width, height } = dims(current);
      const trimmed = tmp('.png');
      // Anchor the crop window at the top-left so the bottom strip is what goes.
      execFileSync(
        'sips',
        [
          '--cropOffset',
          '0',
          '0',
          '--cropToHeightWidth',
          String(height - crop.trimBottomPx),
          String(width),
          current,
          '--out',
          trimmed,
        ],
        { stdio: 'pipe' },
      );
      current = trimmed;
    }
    const { width, height } = dims(current);
    const scale = Math.max(TARGET_W / width, TARGET_H / height);
    const w = Math.max(TARGET_W, Math.round(width * scale));
    const h = Math.max(TARGET_H, Math.round(height * scale));
    const resized = tmp('.png');
    execFileSync(
      'sips',
      ['--resampleHeightWidth', String(h), String(w), current, '--out', resized],
      {
        stdio: 'pipe',
      },
    );
    const cropped = tmp('.png');
    const offY = Math.round((h - TARGET_H) * (crop.focusY ?? 0.5));
    const offX = Math.round((w - TARGET_W) * (crop.focusX ?? 0.5));
    execFileSync(
      'sips',
      [
        '--cropToHeightWidth',
        String(TARGET_H),
        String(TARGET_W),
        '--cropOffset',
        String(offY),
        String(offX),
        resized,
        '--out',
        cropped,
      ],
      { stdio: 'pipe' },
    );
    execFileSync(CWEBP_BIN, ['-q', '80', cropped, '-o', outWebp], { stdio: 'pipe' });
  } finally {
    for (const p of tmps) if (existsSync(p)) unlinkSync(p);
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function flag(name: string): boolean {
  return process.argv.includes(name);
}

export function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function onlyList(): string[] | undefined {
  return option('--only')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
