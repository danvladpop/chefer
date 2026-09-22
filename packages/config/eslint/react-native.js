// @ts-check
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/** @type {import('typescript-eslint').ConfigArray} */
export const reactNative = tseslint.config(...base, {
  plugins: {
    react: reactPlugin,
    'react-hooks': reactHooksPlugin,
  },
  rules: {
    ...reactPlugin.configs.recommended.rules,
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Platform boundary (CLAUDE.md Platform Parity): the mobile app must never
    // pull in web-only or server-only modules.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@chefer/ui',
            message: 'DOM-only component library — use packages/ui-mobile in the app.',
          },
          {
            name: '@chefer/database',
            message: 'Mobile never touches the DB — call the API via tRPC.',
          },
          {
            name: '@prisma/client',
            message: 'Mobile never touches the DB — call the API via tRPC.',
          },
          { name: 'react-dom', message: 'Web-only — not available in React Native.' },
        ],
        patterns: [
          { group: ['next', 'next/*'], message: 'Next.js is web-only.' },
          { group: ['@chefer/ui/*'], message: 'DOM-only component library.' },
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

export default reactNative;
