// @ts-check
import { base } from '@chefer/eslint-config/base';

export default [
  { ignores: ['dist/**'] },
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
