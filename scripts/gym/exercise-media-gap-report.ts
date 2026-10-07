/**
 * exercise-media-gap-report.ts (WP-23 / FB7-06)
 *
 * Prints, per catalog exercise, whether it has a photo (freeExerciseDbId + both
 * vendored webp frames, not hidden) and a video (videoId), then a summary and
 * the lists of exercises still missing either. Exits 1 if anything is missing
 * unless `--no-fail` is passed.
 *
 * Usage (repo root):
 *   cd apps/api && pnpm exec tsx ../../scripts/gym/exercise-media-gap-report.ts [--no-fail]
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISE_CATALOG, HIDDEN_EXERCISE_IMAGE_IDS } from '@chefer/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', '..', 'apps', 'api', 'static', 'exercises');

const rows = EXERCISE_CATALOG.map((e) => {
  const hasFiles =
    existsSync(join(DIR, `${e.id}-0.3x2.webp`)) && existsSync(join(DIR, `${e.id}-1.3x2.webp`));
  const hidden = HIDDEN_EXERCISE_IMAGE_IDS.has(e.id);
  const photo = e.freeExerciseDbId !== null && hasFiles && !hidden;
  const video = e.videoId !== null;
  return { id: e.id, photo, video, hidden, dbId: e.freeExerciseDbId };
});

for (const r of rows) {
  console.log(
    `${r.photo ? 'photo' : r.hidden ? 'HIDDN' : '-----'}  ${r.video ? 'video' : '-----'}  ${r.id}`,
  );
}
const noPhoto = rows.filter((r) => !r.photo);
const noVideo = rows.filter((r) => !r.video);
console.log(
  `\nTotal ${rows.length}; missing photo ${noPhoto.length}; missing video ${noVideo.length}; ` +
    `missing both ${rows.filter((r) => !r.photo && !r.video).length}`,
);
console.log(`\nNo photo: ${noPhoto.map((r) => r.id).join(', ')}`);
console.log(`\nNo video: ${noVideo.map((r) => r.id).join(', ')}`);
if (noPhoto.length + noVideo.length > 0 && !process.argv.includes('--no-fail')) {
  process.exitCode = 1;
}
