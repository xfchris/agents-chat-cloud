// Ajustes de cobertura compartidos por los proyectos de test.
// Cada proyecto pasa su propio `include` para que correr solo un set de tests
// no marque el código del otro set como 0% y rompa el umbral en falso.
const THRESHOLD = 90;

export function coverageFor(include: string[]) {
  return {
    provider: 'v8' as const,
    include,
    thresholds: {
      lines: THRESHOLD,
      functions: THRESHOLD,
      branches: THRESHOLD,
      statements: THRESHOLD,
    },
  };
}
