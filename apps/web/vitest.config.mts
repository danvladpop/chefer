import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors tsconfig's `@/*` path alias so unit tests can import app modules
// that use it (e.g. the gym workout hooks, which import '@/lib/trpc'). The
// react plugin gives component render tests (`@vitest-environment jsdom` +
// @testing-library/react) the automatic JSX runtime our components rely on.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '.next/**', 'dist/**'],
  },
});
