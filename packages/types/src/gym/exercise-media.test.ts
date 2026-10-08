// FB7-06 / WP-25: every exercise ships with a photo pair and a demo video. A new
// catalog row without media fails here (and in CI) instead of silently shipping a
// muscle-group placeholder. The ONLY exceptions are the commented allow-lists below,
// which may only shrink (a slug that gained media must be removed, asserted below).
//
// Photos come from three places, all under apps/api/static/exercises/:
//   - free-exercise-db (public domain; the entry has a `freeExerciseDbId`),
//   - openly licensed Wikimedia Commons photos (CC0 / PD / CC BY / CC BY-SA),
//   - AI renders (scripts/gym/generate-exercise-photos.ts).
// Everything that is not free-exercise-db must have a provenance entry in
// docs/gym/exercise-photo-sources.json (the README credits table is built from it).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXERCISE_CATALOG, HIDDEN_EXERCISE_IMAGE_IDS } from './exercise-catalog';
import { exercisePhotoFiles } from './exercise-photos';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PHOTO_DIR = join(ROOT, 'apps', 'api', 'static', 'exercises');
const SOURCES_FILE = join(ROOT, 'docs', 'gym', 'exercise-photo-sources.json');

type FrameSource = { file: string; sourceUrl?: string; author?: string; license?: string };
type SourceEntry = { source: 'commons' | 'ai'; frames: [FrameSource, FrameSource] };
const SOURCES = JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) as Record<string, SourceEntry>;

const hasPhoto = (id: string): boolean =>
  !HIDDEN_EXERCISE_IMAGE_IDS.has(id) &&
  exercisePhotoFiles(id).every((f) => existsSync(join(PHOTO_DIR, f)));

/**
 * Exercises with no photo yet: openly licensed photos did not exist and every AI render
 * (scripts/gym/generate-exercise-photos.ts, 3 rounds x 3-4 candidates each) showed the
 * wrong movement or wrong equipment, so they show the muscle-group icon placeholder
 * rather than a misleading photo. Re-try with a new seed (--reseed N) or a licensed photo
 * (vendor-commons-photos.ts) and remove the slug.
 */
const NO_PHOTO_ALLOWED: ReadonlySet<string> = new Set<string>([
  // Machine the model cannot draw: every render looked like a squat rack or a pull-up bar.
  'assisted-dip',
  // The all-fours start frame rendered fine, but no end frame (opposite arm and leg extended in
  // one horizontal line) did: all were a kneeling lunge or a one-arm reach.
  'bird-dog',
  // The model never put the rear FOOT on the bench (it sat or lunged beside it).
  'bodyweight-bulgarian-split-squat',
  // Renders showed her on her back with her legs in the air, or a stretch, never a clamshell.
  'clamshell',
  // Renders were a seated row or a bench plank; no hips-up bridge on a bench.
  'dumbbell-hip-thrust',
]);

/** Exercises with no demo video: none (every preset has an oEmbed-verified one). */
const NO_VIDEO_ALLOWED: ReadonlySet<string> = new Set<string>();

describe('exercise media coverage (FB7-06, WP-25)', () => {
  it('gives every exercise a photo pair unless it is on the commented allow-list', () => {
    const missing = EXERCISE_CATALOG.filter((e) => !hasPhoto(e.id) && !NO_PHOTO_ALLOWED.has(e.id));
    expect(
      missing.map((e) => e.id),
      'exercises without a photo: scripts/gym/vendor-exercise-photos.ts, vendor-commons-photos.ts or generate-exercise-photos.ts',
    ).toEqual([]);
  });

  it('gives every exercise a demo video unless it is on the commented allow-list', () => {
    const missing = EXERCISE_CATALOG.filter(
      (e) => e.videoId === null && !NO_VIDEO_ALLOWED.has(e.id),
    );
    expect(
      missing.map((e) => e.id),
      'exercises without a video: add an oEmbed-verified id',
    ).toEqual([]);
  });

  it('keeps the allow-lists honest: known slugs that really lack the media', () => {
    const byId = new Map(EXERCISE_CATALOG.map((e) => [e.id, e]));
    for (const id of NO_PHOTO_ALLOWED) {
      expect(byId.has(id), `${id} is not in the catalog`).toBe(true);
      expect(hasPhoto(id), `${id} now has a photo: remove it from NO_PHOTO_ALLOWED`).toBe(false);
    }
    for (const id of NO_VIDEO_ALLOWED) {
      expect(byId.get(id)?.videoId, `${id} now has a video: remove it`).toBeNull();
    }
  });

  it('hides no photo any more (every shipped photo shows its exercise)', () => {
    expect([...HIDDEN_EXERCISE_IMAGE_IDS]).toEqual([]);
  });

  it('records the oEmbed channel for every video', () => {
    for (const e of EXERCISE_CATALOG) {
      if (e.videoId !== null) expect(e.videoChannel?.trim(), e.id).toBeTruthy();
    }
  });

  it('records provenance for every photo that is not from free-exercise-db', () => {
    const undocumented = EXERCISE_CATALOG.filter(
      (e) => e.freeExerciseDbId === null && hasPhoto(e.id) && !SOURCES[e.id],
    ).map((e) => e.id);
    expect(undocumented, 'add them to docs/gym/exercise-photo-sources.json').toEqual([]);
  });

  it('keeps the provenance file honest: real slugs, real files, licences we can use', () => {
    const slugs = new Set(EXERCISE_CATALOG.map((e) => e.id));
    for (const [id, entry] of Object.entries(SOURCES)) {
      expect(slugs.has(id), `${id} is not in the catalog`).toBe(true);
      expect(
        entry.frames.map((f) => f.file),
        id,
      ).toEqual(exercisePhotoFiles(id));
      for (const f of entry.frames) {
        expect(existsSync(join(PHOTO_DIR, f.file)), `${f.file} is missing`).toBe(true);
        if (entry.source === 'commons') {
          expect(f.sourceUrl, `${f.file} needs its Commons page`).toMatch(
            /^https:\/\/commons\.wikimedia\.org\//,
          );
          expect(f.author?.trim(), `${f.file} needs its author`).toBeTruthy();
          // CC0 / public domain / CC BY / CC BY-SA only: no NC, no ND.
          expect(f.license, f.file).toMatch(/^(CC0|Public domain|CC BY(-SA)? \d\.\d)/i);
          expect(f.license, f.file).not.toMatch(/\b(NC|ND)\b/);
        }
      }
    }
  });
});
