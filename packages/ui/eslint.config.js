// @ts-check
// Uses the base config for now — react/react-hooks rules ship with the shared
// nextjs config, which drags in Next-specific rules that don't apply to a
// plain component library. A dedicated shared react config is a follow-up.
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
