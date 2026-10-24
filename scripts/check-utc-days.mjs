#!/usr/bin/env node
// ─── UTC-day guard (§2.12, T-21.1) ──────────────────────────────────────────────
// A grep-based lint: fails CI when `apps/api/src/application/**` derives a
// "day" string from the SERVER's UTC clock instead of the user's local date
// (§2.12 — every procedure that means "a day" should reckon it from the
// user's own time zone, `ChefProfile.timeZone`, not the server host's
// clock). The two offending patterns:
//   new Date().toISOString().split('T')[0]
//   <date>.toISOString().slice(0, 10)
//
// Wave 0 (T-00.10) shipped this as a scaffold with every CURRENT hit on the
// allowlist below. Wave-1 (T-21.1, L-ENTRY) fixed bug B-06: `chat.service.ts`
// no longer derives "today" from the server's clock (it reads the user's
// `ChefProfile.timeZone`, `localDateInZone`/`localDayIndexInZone`) — removed
// from the allowlist below. It stays listed with a narrower reason: one
// remaining hit in the same file (the chef-review "week of …" line) FORMATS
// an already-computed week-start `Date` for display, not a day derivation —
// this guard is a blunt grep and can't tell the two apart, so the file keeps
// one line-scoped allowance instead of a blanket exemption. Bug B-33
// (`tracker.service.ts`) is a different lane's fix and is still open.
// Test files (`*.test.ts`) are always exempt: fixture helpers, not
// application logic.
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
  'tracker/tracker.service.ts', // bug B-33 (§2.12) — not yet fixed (a different lane)
  'gym/gym-export.service.ts', // filename timestamp, not a "day" business date
  'gym/mappers.ts',
  'gym/gym-stats.service.ts',
  'notifications/weekly-email.service.ts',
]);

// Line-scoped allowance: `chat/chat.service.ts`'s bug B-06 (deriving "today"
// from the server clock) is fixed by T-21.1, but the file has one unrelated,
// legitimate hit this blunt grep can't distinguish — formatting an
// ALREADY-COMPUTED week-start `Date` for a chat reply, not deriving a day
// from "now". Matched by a distinctive substring, not a line number (which
// drifts) — never widen this to a whole-file allowance again.
const LINE_ALLOWLIST = new Map([['chat/chat.service.ts', ['weekStart.toISOString()']]]);

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
    const lineAllowances = LINE_ALLOWLIST.get(rel) ?? [];
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!PATTERN.test(line)) return;
      if (lineAllowances.some((needle) => line.includes(needle))) return;
      violations.push(`${relative(REPO_ROOT, file)}:${i + 1}: ${line.trim()}`);
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
