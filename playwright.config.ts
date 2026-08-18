import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// E2E contra el Worker + Durable Object reales servidos por `wrangler dev`
// (no contra la nube): un solo origen sirve el frontend compilado y la API/WS.
// El `webServer` construye el frontend y arranca wrangler antes de los tests.
const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

// Estado de la DO en un directorio temporal nuevo por corrida: evita mensajes
// fantasma de una corrida anterior al depurar en local. Bajo el tmp del sistema,
// así que git nunca lo ve. En CI el checkout ya es limpio; esto no estorba.
const persistDir = mkdtempSync(join(tmpdir(), 'agents-chat-e2e-'));

export default defineConfig({
  testDir: './test/e2e',
  // El timing del WebSocket se maneja con expect.poll/waitFor en los tests, no
  // con sleeps; un timeout de test holgado cubre el arranque frío de la DO.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // i18n (SPEC 08): fija el navegador en español para que la app arranque en ese
    // idioma. Sin `locale`, el LanguageDetector usa `navigator.language` del runner
    // (en-US en CI) y la UI saldría en inglés, rompiendo las aserciones de texto en
    // español ("en línea", "Enviar", "Mensaje").
    locale: 'es-ES',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Compila el frontend a dist/client y levanta el Worker+DO en un solo origen.
    command: `npm run build && npx wrangler dev --port ${PORT} --persist-to ${persistDir}`,
    url: BASE_URL,
    // En local reutiliza un server ya abierto; en CI siempre arranca uno limpio.
    reuseExistingServer: !process.env.CI,
    // wrangler dev descarga workerd y compila en el primer arranque: margen amplio.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
