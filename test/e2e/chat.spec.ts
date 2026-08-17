import { test, expect, type Browser, type Page } from '@playwright/test';

// E2E del flujo real contra `wrangler dev` (Worker + Durable Object): dos clientes
// en una misma sala se ven mensajes y presencia; salas distintas quedan aisladas.
// Todo el timing del WebSocket se resuelve con las esperas con reintento de
// Playwright (toHaveText / toContainText), nunca con sleeps fijos.

// Abre una sala en su propio contexto (localStorage aislado). El nombre se siembra
// ANTES de cargar la app para que el `hello` inicial ya lo use y no deje un
// participante «humano» fantasma por el TTL de presencia.
async function openRoom(
  browser: Browser,
  room: string,
  name: string,
): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((seededName) => {
    window.localStorage.setItem('chatName', seededName);
  }, name);
  const page = await context.newPage();
  await page.goto(`/r/${room}`);
  // El indicador de conexión pasa a «en línea» cuando el WebSocket abre.
  await expect(page.locator('.conn')).toHaveText('en línea');
  return page;
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel('Mensaje').fill(text);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

test('dos clientes en la misma sala comparten mensajes y presencia', async ({
  browser,
}) => {
  const alice = await openRoom(browser, 'prueba', 'alice');
  const bob = await openRoom(browser, 'prueba', 'bob');

  // La presencia (broadcast de la DO) muestra a ambos en las dos pestañas.
  await expect(alice.locator('.presence-list')).toContainText('alice');
  await expect(alice.locator('.presence-list')).toContainText('bob');
  await expect(bob.locator('.presence-list')).toContainText('alice');
  await expect(bob.locator('.presence-list')).toContainText('bob');

  // Un mensaje de alice llega al log de bob por WebSocket.
  await sendMessage(alice, 'hola equipo desde alice');
  await expect(bob.locator('.log')).toContainText('hola equipo desde alice');
  await expect(bob.locator('.log')).toContainText('alice');
});

test('salas distintas están aisladas', async ({ browser }) => {
  const roomA = await openRoom(browser, 'sala-alfa', 'agente-a');
  const roomB = await openRoom(browser, 'sala-beta', 'agente-b');

  // Barrera temporal explícita: espera a que el mensaje complete el round-trip por
  // la DO de alfa (se ve en su propia sala) ANTES de afirmar su ausencia en beta.
  await sendMessage(roomA, 'mensaje-solo-en-sala-alfa');
  await expect(roomA.locator('.log')).toContainText('mensaje-solo-en-sala-alfa');

  // Otro round-trip en beta: ver su propio mensaje prueba que la DO de beta ya
  // procesó y difundió; si compartieran estado, el de alfa ya estaría aquí.
  await sendMessage(roomB, 'mensaje-solo-en-sala-beta');
  await expect(roomB.locator('.log')).toContainText('mensaje-solo-en-sala-beta');

  // Aislamiento: la sala beta nunca recibe el mensaje de la sala alfa. Ojo: esta
  // aserción negativa NO espera por sí sola (pasa de inmediato si está ausente);
  // las dos barreras de arriba son las que garantizan que el mensaje ya habría
  // llegado si las salas compartieran estado.
  await expect(roomB.locator('.log')).not.toContainText('mensaje-solo-en-sala-alfa');
});
