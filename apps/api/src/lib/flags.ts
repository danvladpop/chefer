import { ALL_FEATURE_FLAGS_OFF, FEATURE_FLAG_KEYS, type FeatureFlags } from '@chefer/types';
import { env } from './env.js';

// ─── Feature flags (§2.9, T-00.8) ──────────────────────────────────────────────
// Parses the one env var (FEATURE_FLAGS, a comma list of enabled keys) into
// the typed set both server code and `profile.flags` read. Flipping a flag
// is an env change + API restart, no deploy (§2.9).

function parseFeatureFlags(raw: string): FeatureFlags {
  // Defensive: `env.FEATURE_FLAGS` is a required, defaulted string in
  // lib/env.ts, but a test file that mocks `../lib/env.js` with a partial
  // object (omitting FEATURE_FLAGS) would otherwise crash any module that
  // imports this one transitively (§2.9, T-35.4 exposed this importing
  // targets.service.ts from coach.service.ts) — never throw over a missing
  // flags string, just treat it as "no flags enabled".
  const enabled = new Set(
    (raw ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0),
  );
  const flags: FeatureFlags = {};
  for (const key of FEATURE_FLAG_KEYS) {
    if (enabled.has(key)) flags[key] = true;
  }
  return flags;
}

/** The parsed flag set for this process — every flag not in FEATURE_FLAGS is OFF. */
export const flags: FeatureFlags = parseFeatureFlags(env.FEATURE_FLAGS);

/** Whether `key` is enabled server-side. Server behaviour reads this, never `process.env` directly. */
export function isFlagEnabled(key: keyof FeatureFlags): boolean {
  return flags[key] === true;
}

/** The full set, with every key present (`profile.flags`'s response shape). */
export function allFlags(): Required<FeatureFlags> {
  return { ...ALL_FEATURE_FLAGS_OFF, ...flags };
}
