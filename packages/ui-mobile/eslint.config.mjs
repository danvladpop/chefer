// @ts-check
import { reactNative } from '@chefer/eslint-config/react-native';

export default [
  { ignores: ['*.config.{js,mjs,ts}'] },
  ...reactNative,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
