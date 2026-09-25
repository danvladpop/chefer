/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/unit/**/*.test.{ts,tsx}'],
  // The @chefer/* packages publish raw TS via an "import"-only exports map,
  // which Jest's CJS resolver can't follow — point straight at the source.
  moduleNameMapper: {
    '^@chefer/ui-mobile$': '<rootDir>/../../packages/ui-mobile/src/index.ts',
    '^@chefer/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@chefer/utils$': '<rootDir>/../../packages/utils/src/index.ts',
  },
  // jest-expo's default pattern assumes npm/yarn layout; pnpm nests packages
  // under node_modules/.pnpm/<pkg>@<version>/node_modules/, so allow the RN /
  // Expo ecosystem to be transformed from there too. The pnpm hash segment
  // (`.pnpm/<pkg>@<version>_<hash>/node_modules/`) is ONE path component with
  // no internal slash, so it must be skipped as a whole before matching the
  // real package name — a transitive, non-hoisted package like
  // @expo/vector-icons (gym_plan.md G2-B: Ionicons in the setup/settings
  // screens) sits at `.pnpm/@expo+vector-icons@<v>/node_modules/@expo/vector-icons/`
  // and was never matched by the old `(?:\\.pnpm/)?` prefix, which assumed
  // the package name followed `.pnpm/` directly.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-css-interop|nativewind|superjson|copy-anything|is-what|@chefer/.*))',
  ],
};
