/**
 * exercise-photo-contact-sheet.ts (T-05.11, UX-05 A6 AC30-34)
 *
 * Generates a single static HTML page listing every vendored exercise photo
 * (both frames) next to its slug and name, for a human (or an agent with a
 * browser/image-reading tool) to sweep for the wrong-exercise photos free-
 * exercise-db occasionally mismatches by id. Not a flattened image — an HTML
 * grid needs no new image-processing dependency and each photo stays a
 * normal <img>, so a reviewer can zoom any one of them.
 *
 * Usage (from the repo root):
 *   cd apps/api && pnpm exec tsx ../../scripts/gym/exercise-photo-contact-sheet.ts [outFile]
 *
 * Default output: apps/api/static/exercises/contact-sheet.html (gitignored —
 * it's a review tool, not a served asset; see apps/api/static/.gitignore).
 * Open it directly from disk (file://) or serve apps/api/static and visit
 * /static/exercises/contact-sheet.html.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISE_CATALOG } from '@chefer/types';
import { imageKeysFor } from '../../apps/api/src/lib/exercise-library/ensure';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(
  process.argv[2] ??
    join(__dirname, '..', '..', 'apps', 'api', 'static', 'exercises', 'contact-sheet.html'),
);

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function main(): void {
  const rows = EXERCISE_CATALOG.map((e) => {
    const keys = imageKeysFor(e);
    const cells = keys
      .map(
        (k) =>
          `<img src="./${k}" alt="${escapeHtml(e.name)}" loading="lazy" width="300" height="200" />`,
      )
      .join('\n      ');
    return `
    <section class="row" data-slug="${e.id}">
      <h2>${escapeHtml(e.name)} <code>${e.id}</code></h2>
      ${keys.length > 0 ? cells : '<p class="none">No photo (' + (e.freeExerciseDbId ? 'free-exercise-db ' + escapeHtml(e.freeExerciseDbId) : 'no source') + ')</p>'}
    </section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Exercise photo contact sheet (${EXERCISE_CATALOG.length} exercises)</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #111; color: #eee; }
  h1 { font-size: 18px; }
  .row { margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid #333; }
  .row h2 { font-size: 14px; margin: 0 0 8px; }
  .row h2 code { color: #9ca3af; font-weight: normal; margin-left: 8px; }
  .row img { border-radius: 8px; object-fit: cover; margin-right: 8px; background: #222; }
  .none { color: #6b7280; font-size: 13px; }
</style>
</head>
<body>
<h1>Exercise photo contact sheet — ${EXERCISE_CATALOG.length} catalog exercises, generated ${new Date().toISOString().slice(0, 10)}</h1>
<p>Sweep for a photo showing the wrong exercise or movement (free-exercise-db ids occasionally point at a near-miss; AI renders get extra limbs and wrong gear). Fix a bad AI render with generate-exercise-photos.ts --only slug --force --reseed N; a wrong dataset photo gets a replacement (new revision in exercise-photos.ts) or, as a last resort, the slug in HIDDEN_EXERCISE_IMAGE_IDS so ExerciseImage/PhotoCrossfade show the icon placeholder.</p>
${rows}
</body>
</html>`;

  writeFileSync(OUT_FILE, html);
  console.log(`Wrote ${OUT_FILE} (${EXERCISE_CATALOG.length} exercises).`);
}

main();
