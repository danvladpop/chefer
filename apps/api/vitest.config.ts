import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@chefer/types': path.resolve('../../packages/types/src/index.ts'),
      '@chefer/utils': path.resolve('../../packages/utils/src/index.ts'),
      '@chefer/database': path.resolve('../../packages/database/src/index.ts'),
    },
  },
});
