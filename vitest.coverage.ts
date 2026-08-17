// Ajustes de cobertura compartidos por los proyectos de test.
// Cada proyecto pasa su propio `include` para que correr solo un set de tests
// no marque el código del otro set como 0% y rompa el umbral en falso.
//
// El provider varía por proyecto: `@vitest/coverage-v8` NO corre bajo
// `@cloudflare/vitest-pool-workers` (importa `node:inspector/promises`, ausente
// en workerd → la suite ni arranca con --coverage). El backend usa `istanbul`
// (instrumenta en transform, compatible con el pool); el web (jsdom) usa `v8`.
const THRESHOLD = 90;

type Provider = 'v8' | 'istanbul';

export function coverageFor(include: string[], provider: Provider = 'v8') {
  return {
    provider,
    include,
    thresholds: {
      lines: THRESHOLD,
      functions: THRESHOLD,
      branches: THRESHOLD,
      statements: THRESHOLD,
    },
  };
}
