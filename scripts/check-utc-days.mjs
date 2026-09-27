#!/usr/bin/env node
// ─── UTC-day guard (§2.12, T-21.1) ──────────────────────────────────────────────
// A grep-based lint: fails CI when `apps/api/src/application/**` derives a
// "day" string from the SERVER's UTC clock instead of the device's local
// date (§2.12 — every procedure that means "a day" should accept the
// client's `localDate`). The two offending patterns:
//   new Date().toISOString().split('T')[0]
//   <date>.toISOString().slice(0, 10)
//
// Wave 0 (T-00.10) ships this as a scaffold: it already runs for real, but
// every CURRENT hit is on the allowlist below so the stub passes today.
// Wave-1 fixes (bug B-06 in chat.service.ts, bug B-33 in tracker.service.ts,
// §2.12) each remove their own file from the allowlist in the same PR —
// shrinking it back to [] is the definition of done for T-21.1. Test files
// (`*.test.ts`) are always exempt: fixture helpers, not application logic.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const TARGET_DIR = join(REPO_ROOT, 'apps/api/src/application');

const PATTERN = /toISOString\(\)\s*\.\s*(split\('T'\)\[0\]|slice\(0,\s*10\))/;

// Relative to apps/api/src/application. Every entry here is a KNOWN,
// wave-1-tracked violation — never add a new one for new code.
const ALLOWLIST = new Set([
  'chat/chat.service.ts', // bug B-06 (§2.12) — fixed by T-21.1
  'tracker/tracker.service.ts', // bug B-33 (§2.12) — fixed by T-21.1
  'gym/gym-export.service.ts', // filename timestamp, not a "day" business date
  'gym/mappers.ts',
  'gym/gym-stats.service.ts',
  'notifications/weekly-email.service.ts',
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function main() {
  const files = walk(TARGET_DIR);
  const violations = [];

  for (const file of files) {
    const rel = relative(TARGET_DIR, file);
    if (ALLOWLIST.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) {
        violations.push(`${relative(REPO_ROOT, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  if (violations.length > 0) {
    console.error('UTC-day guard failed — server-UTC "day" derivation outside the allowlist:\n');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nUse the client-sent localDate (§2.12) instead, or add the file to ALLOWLIST in scripts/check-utc-days.mjs with a reason.',
    );
    process.exit(1);
  }

  console.log('UTC-day guard: no new violations.');
}

main();
