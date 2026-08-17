import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { coverageFor } from './vitest.coverage.ts';

// Proyecto web: los tests de React corren en jsdom. Los componentes y hooks
// llegan en SPEC 03; por ahora solo queda el andamiaje.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      shared: fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['test/web/setup.ts'],
    include: ['test/web/**/*.test.{ts,tsx}'],
    coverage: coverageFor(['web/src/**/*.{ts,tsx}']),
  },
});
