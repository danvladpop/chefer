import { defineConfig } from 'vitest/config';

// Contract tests: Node-only, no react-native imports anywhere in the tested
// graph. They hit the REAL local API (pnpm dev) through the same link stack
// the app ships (src/lib/trpc-links.ts) — the fastest feedback loop that
// exercises actual auth, serialization and procedure behavior.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/contract/**/*.test.ts'],
    testTimeout: 15_000,
    globalSetup: ['./tests/contract/global-setup.ts'],
  },
});
