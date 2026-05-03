import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    // tests/unit/ é vitest; tests/ raiz é Playwright (E2E). Sem esse `include`,
    // vitest tentaria rodar os specs Playwright e quebraria nos imports deles.
    include: ['tests/unit/**/*.spec.ts', 'src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
    },
  },
});
