// @ts-check
import { node } from '@chefer/eslint-config/node';

export default [
  { ignores: ['dist/**'] },
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
    // seed.ts is a CLI entrypoint — exiting with a status code is its job
    files: ['src/seed.ts'],
    rules: { 'n/no-process-exit': 'off' },
  },
];
