// @ts-check
import { nextjs } from '@chefer/eslint-config/nextjs';

export default [
  { ignores: ['.next/**', 'next-env.d.ts', 'dist/**', '*.config.{js,ts}', 'postcss.config.js'] },
  ...nextjs,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // ─── RATCHET (staged adoption — see roadmap.md P0-0) ─────────────────────
    // This app was never linted before 2026-08. The rules below are the
    // shared-config target but currently have too many pre-existing hits to
    // fix in the enablement PR. They are WARN here so new findings are visible
    // in every lint run without blocking CI. Ratchet: pick a rule, fix its
    // warnings, delete its line. Never add a rule to this block.
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
    },
  },
];
