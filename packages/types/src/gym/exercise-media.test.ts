// FB7-06 (tester feedback 2026-10-07): every exercise must ship with a photo and a
// demo video so a new catalog row can't silently go out without media again.
// Exceptions live in the two allow-lists below, each with a reason. The allow-lists
// may only shrink: a slug that gained media must be removed (asserted below).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXERCISE_CATALOG, HIDDEN_EXERCISE_IMAGE_IDS } from './exercise-catalog';

const PHOTO_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'apps',
  'api',
  'static',
  'exercises',
);

const hasPhoto = (e: { id: string; freeExerciseDbId: string | null }): boolean =>
  e.freeExerciseDbId !== null &&
  !HIDDEN_EXERCISE_IMAGE_IDS.has(e.id) &&
  existsSync(join(PHOTO_DIR, `${e.id}-0.3x2.webp`)) &&
  existsSync(join(PHOTO_DIR, `${e.id}-1.3x2.webp`));

/**
 * No acceptable free-exercise-db photo (the dataset has no entry for the same movement
 * and equipment, or only a visibly different variant), so these show the muscle-group
 * icon placeholder. Re-check against the dataset before adding a slug here.
 */
const NO_PHOTO_ALLOWED: ReadonlySet<string> = new Set([
  // No dataset entry for the movement (or only a different variant: bent-over row for
  // Pendlay, one-arm KB swing, KB pistol squat, a barbell hip thrust, ...).
  'pendlay-row',
  'landmine-press',
  'kettlebell-press',
  'machine-lateral-raise',
  'assisted-dip',
  'pendulum-squat',
  'belt-squat',
  'kettlebell-swing',
  'kettlebell-deadlift',
  'bulgarian-split-squat',
  'bodyweight-bulgarian-split-squat',
  'glute-kickback-machine',
  'hollow-body-hold',
  'bird-dog',
  'suitcase-carry',
  'dumbbell-hip-thrust',
  'pistol-squat',
  'wall-sit',
  'reverse-lunge',
  'lateral-lunge',
  'step-up',
  'single-leg-romanian-deadlift',
  'clamshell',
  'single-leg-calf-raise',
  'kneeling-push-up',
  'pike-push-up',
  // free-exercise-db's "Plank" id shows a kneeling lunge stretch (hidden photo).
  'plank',
  // Cardio / activity presets without a matching dataset photo (outdoor, class-style,
  // recumbent bike; the dataset's "Bicycling" photo is a helmet close-up).
  'outdoor-walk',
  'outdoor-run',
  'outdoor-cycle',
  'stationary-bike-recumbent',
  'spin-class',
  'pilates-class',
  'yoga-class',
  'hiit-class',
  'dance-class',
  'swimming',
  'running',
  'walking',
  'other-activity',
]);

/** Class-style activity presets: there is no single movement to demonstrate. */
const NO_VIDEO_ALLOWED: ReadonlySet<string> = new Set([
  'spin-class',
  'pilates-class',
  'yoga-class',
  'hiit-class',
  'dance-class',
  'other-activity',
]);

describe('exercise media coverage (FB7-06)', () => {
  it('gives every exercise a photo unless it is on the commented allow-list', () => {
    const missing = EXERCISE_CATALOG.filter((e) => !hasPhoto(e) && !NO_PHOTO_ALLOWED.has(e.id));
    expect(
      missing.map((e) => e.id),
      'exercises without a photo: vendor one (scripts/gym/vendor-exercise-photos.ts) or allow-list with a reason',
    ).toEqual([]);
  });

  it('gives every exercise a demo video unless it is on the commented allow-list', () => {
    const missing = EXERCISE_CATALOG.filter(
      (e) => e.videoId === null && !NO_VIDEO_ALLOWED.has(e.id),
    );
    expect(
      missing.map((e) => e.id),
      'exercises without a video: add an oEmbed-verified id or allow-list with a reason',
    ).toEqual([]);
  });

  it('keeps the allow-lists honest: known slugs that really lack the media', () => {
    const byId = new Map(EXERCISE_CATALOG.map((e) => [e.id, e]));
    for (const id of NO_PHOTO_ALLOWED) {
      const e = byId.get(id);
      expect(e, `${id} is not in the catalog`).toBeDefined();
      if (e)
        expect(hasPhoto(e), `${id} now has a photo: remove it from NO_PHOTO_ALLOWED`).toBe(false);
    }
    for (const id of NO_VIDEO_ALLOWED) {
      const e = byId.get(id);
      expect(e, `${id} is not in the catalog`).toBeDefined();
      if (e) expect(e.videoId, `${id} now has a video: remove it from NO_VIDEO_ALLOWED`).toBeNull();
    }
  });

  it('records the oEmbed channel for every video', () => {
    for (const e of EXERCISE_CATALOG) {
      if (e.videoId !== null) expect(e.videoChannel?.trim(), e.id).toBeTruthy();
    }
  });
});
