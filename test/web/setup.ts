// Extiende `expect` con los matchers de jest-dom (toBeInTheDocument, toBeDisabled…)
// y limpia el DOM entre tests. Lo carga `setupFiles` de vitest.web.config.ts.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18n from '../../web/src/i18n';

// El detector de idioma resolvería `en` en jsdom (navigator.language = en-US),
// pero la suite existente asevera textos en español. Fijamos `es` antes de cada
// test para un idioma por defecto determinista; los tests de i18n que necesiten
// otro idioma lo cambian explícitamente.
beforeEach(async () => {
  localStorage.setItem('i18nextLng', 'es');
  await i18n.changeLanguage('es');
});

afterEach(() => {
  cleanup();
});
