import { defineConfig } from 'vitest/config';
import { coverageFor } from './vitest.coverage.ts';

// Config raíz: compone los dos proyectos (backend en Workers, web en jsdom) para
// una corrida conjunta. Los scripts `test:backend` / `test:web` usan sus configs
// dedicadas para medir cobertura por proyecto. Umbral 90 en las 4 métricas.
export default defineConfig({
  test: {
    projects: ['./vitest.backend.config.ts', './vitest.web.config.ts'],
    coverage: coverageFor(['src/**/*.ts', 'web/src/**/*.{ts,tsx}']),
  },
});
