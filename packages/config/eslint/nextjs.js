// @ts-check
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/** @type {import('typescript-eslint').ConfigArray} */
export const nextjs = tseslint.config(...base, {
  plugins: {
    '@next/next': nextPlugin,
    react: reactPlugin,
    'react-hooks': reactHooksPlugin,
  },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,
    ...reactPlugin.configs.recommended.rules,
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@next/next/no-html-link-for-pages': 'error',
    '@typescript-eslint/no-misused-promises': [
      'error',
      { checksVoidReturn: { attributes: false } },
    ],

    // Platform boundary (CLAUDE.md Platform Parity): web never imports the
    // native stack — those modules live in apps/mobile + packages/ui-mobile.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['react-native', 'react-native/*', 'react-native-*', 'expo', 'expo-*'],
            message: 'Native-only — belongs in apps/mobile / packages/ui-mobile.',
          },
        ],
      },
    ],
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
});

export default nextjs;
