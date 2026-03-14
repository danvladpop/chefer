// @ts-check
import { base } from './base.js';
import tseslint from 'typescript-eslint';
import nodePlugin from 'eslint-plugin-n';

/** @type {import('typescript-eslint').ConfigArray} */
export const node = tseslint.config(...base, {
  plugins: {
    n: nodePlugin,
  },
  rules: {
    ...nodePlugin.configs['flat/recommended-module'].rules,
    'n/no-missing-import': 'off', // handled by TypeScript
    'n/no-unsupported-features/es-syntax': 'off', // handled by TypeScript
    'no-console': 'off', // servers can log
    '@typescript-eslint/no-require-imports': 'error',
  },
});

export default node;
