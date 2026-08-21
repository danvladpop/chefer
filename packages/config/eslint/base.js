// @ts-check
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

/** @type {import('typescript-eslint').ConfigArray} */
export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          // `typeof import('…')` is the standard vitest importOriginal typing
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // Repo-policy alignments (see CLAUDE.md), not weakening:
      // `() => setOpen(true)` handler shorthand is idiomatic React — flagging
      // it produces hundreds of no-value rewrites.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Numbers in template strings ("${count} items") are fine; nullish and
      // objects still error.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // CLAUDE.md deliberately mixes `type` (data shapes) and `interface`
      // (extension points); the rule can only enforce one or the other.
      '@typescript-eslint/consistent-type-definitions': 'off',

      // Import — ordering is owned by @ianvs/prettier-plugin-sort-imports
      // (external → internal → relative, enforced on format); import/order's
      // grouping disagrees with it, so enabling both makes lint and format
      // fight over the same lines.
      'import/order': 'off',
      'import/no-duplicates': 'error',
      'import/no-cycle': 'error',

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // `x != null` deliberately matches both null and undefined — the
      // codebase uses it as its nullish check.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      curly: ['error', 'all'],
    },
  },
  prettierConfig,
);

export default base;
