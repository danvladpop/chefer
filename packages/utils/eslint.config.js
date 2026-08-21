// @ts-check
import { base } from '@chefer/eslint-config/base';

export default [
  { ignores: ['dist/**', 'vitest.config.ts'] },
  ...base,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
