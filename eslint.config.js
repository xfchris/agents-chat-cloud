import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Config mínima y consistente para TS y React. El foco es corrección de tipos,
// no estilo (de eso se encarga Prettier vía eslint-config-prettier).
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.wrangler/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.worker },
    },
  },
  {
    // react-hooks@7 expone en `configs['recommended-latest']` un `plugins` en
    // formato array legacy (incompatible con flat config de ESLint 10). Cableamos
    // el plugin a mano y tomamos solo las reglas del preset flat.
    files: ['web/**/*.{ts,tsx}', 'test/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat['recommended-latest'].rules,
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
