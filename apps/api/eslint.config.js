// @ts-check
import { node } from '@chefer/eslint-config/node';

export default [
  { ignores: ['dist/**', '*.config.ts'] },
  ...node,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The server entrypoint owns process lifecycle — graceful-shutdown and
    // fatal-error paths legitimately call process.exit.
    files: ['src/index.ts'],
    rules: { 'n/no-process-exit': 'off' },
  },
  {
    // ─── RATCHET (staged adoption — see roadmap.md P0-0) ─────────────────────
    // This app was never linted before 2026-08. The rules below are the
    // shared-config target but currently have too many pre-existing hits to
    // fix in the enablement PR. They are WARN here so new findings are visible
    // in every lint run without blocking CI. Ratchet: pick a rule, fix its
    // warnings, delete its line. Never add a rule to this block.
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'warn',
    },
  },
];
