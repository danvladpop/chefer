import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The service layer is where the business logic (and the bugs F-1/F-5
      // lived) is — that's what the gate protects. lib/ and routers are
      // covered opportunistically.
      include: ['src/application/**'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary'],
      // RATCHET (roadmap P0-8): floor sits just under measured coverage
      // (28% lines at introduction). Raise it as tests land — target 60% —
      // and never lower it.
      thresholds: {
        lines: 25,
        functions: 40,
        branches: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@chefer/types': path.resolve('../../packages/types/src/index.ts'),
      '@chefer/utils': path.resolve('../../packages/utils/src/index.ts'),
      '@chefer/database': path.resolve('../../packages/database/src/index.ts'),
    },
  },
});
