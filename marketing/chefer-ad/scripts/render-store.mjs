// Renders every Store/* still into docs/app-store/aso-creatives-v1/.
//
//   node scripts/render-store.mjs            # everything
//   node scripts/render-store.mjs play ios--  # only ids starting with these
//
// Bundles once, renders each composition with `remotion still`, then rewrites
// each PNG as 24-bit RGB: both stores reject screenshots with an alpha channel.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = resolve(root, "../../docs/app-store/aso-creatives-v1");
const bundleDir = join(root, "out/store-bundle");
const filters = process.argv.slice(2);

const run = (args, opts = {}) =>
  execFileSync("npx", ["remotion", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...opts,
  });

run(["bundle", "src/index.ts", "--out-dir", bundleDir]);

const ids = run(["compositions", bundleDir, "--quiet"])
  .trim()
  .split(/\s+/)
  .filter((id) => id.includes("--"))
  .filter((id) => !filters.length || filters.some((f) => id.startsWith(f)));

if (!ids.length) {
  console.error(`No Store compositions match: ${filters.join(" ")}`);
  process.exit(1);
}

/** <set>--<w>x<h>--<file> or <set>--<file>, see src/store/StoreCompositions.tsx */
const outPath = (id) => join(outRoot, ...id.split("--")) + ".png";

for (const [i, id] of ids.entries()) {
  const out = outPath(id);
  const tmp = out.replace(/\.png$/, ".rgba.png");
  mkdirSync(dirname(out), { recursive: true });
  console.log(`[${i + 1}/${ids.length}] ${id}`);
  run(["still", bundleDir, id, tmp, "--image-format=png", "--log=error"]);
  run(
    ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp, "-pix_fmt", "rgb24", out],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  rmSync(tmp);
}

rmSync(bundleDir, { recursive: true, force: true });
console.log(`Done: ${ids.length} stills in ${outRoot}`);
