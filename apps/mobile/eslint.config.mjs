// @ts-check
import { reactNative } from '@chefer/eslint-config/react-native';

export default [
  {
    ignores: [
      '.expo/**',
      '.expo-export-check/**',
      'dist/**',
      '*.config.{js,mjs,ts}',
      'expo-env.d.ts',
    ],
  },
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
