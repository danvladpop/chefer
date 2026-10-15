// Voiceover clips with Kokoro (local, Apache-2.0) via scripts/kokoro_tts.py.
// Writes public/voiceover/<voice>/<line>.wav and src/voiceover-manifest.json
// (start frame + duration per line, used for placement and music ducking),
// and fails if any line runs into the next one.
//
//   node scripts/generate-voiceover.mjs            # all voices
//   node scripts/generate-voiceover.mjs heart      # just one
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  readFileSync(join(root, "scripts/voiceover-lines.json"), "utf8"),
);
const manifestPath = join(root, "src/voiceover-manifest.json");
const python = join(root, ".tts/venv/bin/python");
const TOTAL = 720;

const only = process.argv[2];
const voices = Object.entries(config.voices).filter(
  ([name]) => !only || name === only,
);
if (!voices.length) throw new Error(`Unknown voice "${only}"`);

// One Kokoro batch for every clip, so the model loads once.
const jobs = voices.flatMap(([name, v]) =>
  config.lines.map((line) => ({
    text: line.text,
    voice: v.kokoro,
    speed: line.speed ?? v.speed ?? 1,
    out: `public/voiceover/${name}/${line.id}.raw.wav`,
  })),
);
execFileSync(python, ["-I", join(root, "scripts/kokoro_tts.py")], {
  input: JSON.stringify(jobs),
  stdio: ["pipe", "inherit", "inherit"],
});

const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : {};
let problems = 0;

for (const [name] of voices) {
  const dir = join(root, "public/voiceover", name);
  mkdirSync(dir, { recursive: true });
  const clips = {};
  for (const line of config.lines) {
    const raw = join(dir, `${line.id}.raw.wav`);
    const file = join(dir, `${line.id}.wav`);
    // Trim leading/trailing silence so each line starts exactly on its frame.
    const trim = "silenceremove=start_periods=1:start_threshold=-45dB";
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      raw,
      "-af",
      `${trim},areverse,${trim},areverse`,
      file,
    ]);
    rmSync(raw);
    const seconds = Number(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        file,
      ])
        .toString()
        .trim(),
    );
    clips[line.id] = {
      frames: Math.ceil(seconds * config.fps),
      src: `voiceover/${name}/${line.id}.wav`,
    };
  }

  const lines = [...config.lines]
    .sort((x, y) => x.at - y.at)
    .map((line) => ({ id: line.id, at: line.at, ...clips[line.id] }));
  manifest[name] = lines;

  console.log(`\n${name}`);
  lines.forEach((l, i) => {
    const end = l.at + l.frames;
    const limit = lines[i + 1]?.at ?? TOTAL;
    if (end > limit) problems++;
    console.log(
      `  ${l.id.padEnd(12)} ${String(l.at).padStart(3)}–${String(end).padStart(3)} (next ${String(limit).padStart(3)}, gap ${String(limit - end).padStart(3)}f)  ${end <= limit ? "ok" : "OVERLAPS"}`,
    );
  });
}

// Drop voices no longer in the config.
for (const name of Object.keys(manifest))
  if (!config.voices[name]) delete manifest[name];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(problems ? `\n${problems} timing problem(s)` : "\nAll lines fit.");
process.exitCode = problems ? 1 : 0;
