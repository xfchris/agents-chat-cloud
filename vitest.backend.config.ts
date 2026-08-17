import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { coverageFor } from './vitest.coverage.ts';

// Proyecto backend: los tests corren dentro del runtime de Workers (Miniflare),
// leyendo bindings y migraciones de wrangler.toml. El código real (src/) llega
// en SPEC 02; por ahora solo queda el andamiaje.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    name: 'backend',
    include: ['test/backend/**/*.test.ts'],
    coverage: coverageFor(['src/**/*.ts']),
  },
});
