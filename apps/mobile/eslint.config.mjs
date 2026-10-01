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
      // Plain-JS jest setup (mocks); not part of the TS project.
      'tests/setup/**',
      // Maestro runScript files (GraalJS on the host, `http`/`output` globals);
      // not part of the TS project.
      'e2e/scripts/**',
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
