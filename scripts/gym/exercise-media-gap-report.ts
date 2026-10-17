/**
 * exercise-media-gap-report.ts (WP-23 / FB7-06)
 *
 * Prints, per catalog exercise, whether it has a photo (both frames on disk, not
 * hidden) and where it came from (free-exercise-db / commons / ai) and a video (videoId), then a summary and
 * the lists of exercises still missing either. Exits 1 if anything is missing
 * unless `--no-fail` is passed.
 *
 * Usage (repo root):
 *   cd apps/api && pnpm exec tsx ../../scripts/gym/exercise-media-gap-report.ts [--no-fail]
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISE_CATALOG, exercisePhotoFiles, HIDDEN_EXERCISE_IMAGE_IDS } from '@chefer/types';
import { readManifest } from './photo-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', '..', 'apps', 'api', 'static', 'exercises');
const manifest = readManifest();

const rows = EXERCISE_CATALOG.map((e) => {
  const hasFiles = exercisePhotoFiles(e.id).every((f) => existsSync(join(DIR, f)));
  const hidden = HIDDEN_EXERCISE_IMAGE_IDS.has(e.id);
  const photo = hasFiles && !hidden;
  const video = e.videoId !== null;
  const source = manifest[e.id]?.source ?? (e.freeExerciseDbId ? 'free-exercise-db' : '-');
  return { id: e.id, photo, video, hidden, source };
});

for (const r of rows) {
  console.log(
    `${r.photo ? 'photo' : r.hidden ? 'HIDDN' : '-----'}  ${r.video ? 'video' : '-----'}  ${r.id}  [${r.source}]`,
  );
}
const noPhoto = rows.filter((r) => !r.photo);
const noVideo = rows.filter((r) => !r.video);
const bySource = new Map<string, number>();
for (const r of rows.filter((x) => x.photo))
  bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
console.log(
  `\nPhotos by source: ${[...bySource].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
);
console.log(
  `\nTotal ${rows.length}; missing photo ${noPhoto.length}; missing video ${noVideo.length}; ` +
    `missing both ${rows.filter((r) => !r.photo && !r.video).length}`,
);
console.log(`\nNo photo: ${noPhoto.map((r) => r.id).join(', ')}`);
console.log(`\nNo video: ${noVideo.map((r) => r.id).join(', ')}`);
if (noPhoto.length + noVideo.length > 0 && !process.argv.includes('--no-fail')) {
  process.exitCode = 1;
}
