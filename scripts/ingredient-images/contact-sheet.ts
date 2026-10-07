/**
 * contact-sheet.ts — review sheets for the vendored ingredient thumbnails.
 *
 * Writes apps/api/static/ingredients/contact-sheet-<n>.html (48 tiles per page,
 * label = canonical key + drawn subject) and, when Google Chrome is installed,
 * a PNG screenshot next to each so a reviewer (or an agent reading images) can
 * sweep for wrong / ugly renders. Re-render a bad one with:
 *   cd apps/api && pnpm exec tsx ../../scripts/ingredient-images/vendor.ts --only "<key>" --force --reseed
 * (or add a PROMPT_OVERRIDES entry in scripts/ingredient-images/prompt.ts first).
 *
 * Usage:
 *   cd apps/api && pnpm exec tsx ../../scripts/ingredient-images/contact-sheet.ts [--page-size 48]
 * The generated files are gitignored (static/ingredients/.gitignore).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IngredientImageManifest } from '../../apps/api/src/lib/ingredient-images/static-images';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', '..', 'apps', 'api', 'static', 'ingredients');
const CHROME =
  process.env['CHROME_BIN'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COLS = 8;
const TILE = 150;

const sizeArg = process.argv.indexOf('--page-size');
const PAGE_SIZE = Number(sizeArg >= 0 ? process.argv[sizeArg + 1] : 48) || 48;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function main(): void {
  const manifest = JSON.parse(
    readFileSync(join(DIR, 'manifest.json'), 'utf8'),
  ) as IngredientImageManifest;
  const entries = Object.entries(manifest.entries).filter(([, e]) => existsSync(join(DIR, e.file)));

  for (const f of readdirSync(DIR)) {
    if (/^contact-sheet-\d+\.(html|png)$/.test(f)) unlinkSync(join(DIR, f));
  }

  const pages = Math.ceil(entries.length / PAGE_SIZE);
  for (let p = 0; p < pages; p++) {
    const slice = entries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
    const rows = Math.ceil(slice.length / COLS);
    const tiles = slice
      .map(
        ([key, e]) =>
          `<figure><img src="./${esc(e.file)}" width="${TILE}" height="${TILE}" /><figcaption><b>${esc(key)}</b><br>${esc(e.subject)}</figcaption></figure>`,
      )
      .join('');
    const html = `<!doctype html><meta charset="utf-8"><title>Ingredient images ${p + 1}/${pages}</title>
<style>body{margin:0;padding:8px;background:#fff;font:11px/1.25 system-ui,sans-serif;width:${COLS * (TILE + 12)}px}
.g{display:grid;grid-template-columns:repeat(${COLS},${TILE}px);gap:8px 12px}figure{margin:0}img{display:block;border-radius:8px;background:#eee}
figcaption{height:28px;overflow:hidden;color:#222}h1{font-size:13px;margin:0 0 6px}</style>
<h1>Ingredient images — page ${p + 1}/${pages} (${entries.length} total)</h1><div class="g">${tiles}</div>`;
    const htmlFile = join(DIR, `contact-sheet-${p + 1}.html`);
    writeFileSync(htmlFile, html);
    if (existsSync(CHROME)) {
      const height = rows * (TILE + 8 + 28 + 4) + 60;
      execFileSync(
        CHROME,
        [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          `--window-size=${COLS * (TILE + 12) + 16},${height}`,
          `--screenshot=${join(DIR, `contact-sheet-${p + 1}.png`)}`,
          `file://${htmlFile}`,
        ],
        { stdio: 'pipe' },
      );
    }
  }
  console.log(`${entries.length} images → ${pages} contact sheet page(s) in ${DIR}`);
}

main();
