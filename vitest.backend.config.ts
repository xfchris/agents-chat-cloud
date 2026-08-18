import { fileURLToPath } from 'node:url';
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
  resolve: {
    // src/ y los tests importan valores de `shared/*` (p. ej. ROOM_RE,
    // PRESENCE_TTL_MS). Sin este alias, el bundling de pool-workers no resuelve
    // esos imports en el runtime de Miniflare y la suite ni arranca. Réplica de
    // lo que ya hace vitest.web.config.ts para el proyecto web.
    alias: {
      shared: fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    name: 'backend',
    include: ['test/backend/**/*.test.ts'],
    // Istanbul: v8 no arranca bajo pool-workers (ver vitest.coverage.ts).
    coverage: coverageFor(['src/**/*.ts'], 'istanbul', './coverage/backend'),
  },
});
