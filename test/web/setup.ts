// Extiende `expect` con los matchers de jest-dom (toBeInTheDocument, toBeDisabled…)
// y limpia el DOM entre tests. Lo carga `setupFiles` de vitest.web.config.ts.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
