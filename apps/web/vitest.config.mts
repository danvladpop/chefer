import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors tsconfig's `@/*` path alias so unit tests can import app modules
// that use it (e.g. the gym workout hooks, which import '@/lib/trpc').
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '.next/**', 'dist/**'],
  },
});
