import { describe, it, expect } from 'vitest';
import { abortAllDurableObjects } from 'cloudflare:test';
import type { Message } from 'shared/types';
import { postJson, getMessages, uniqueRoom, openWs } from './helpers';

describe('persistencia tras reiniciar la DO', () => {
  it('el historial sobrevive a un reinicio y se re-emite al conectar por WS', async () => {
    const room = uniqueRoom();
    await postJson(`/r/${room}/messages`, { name: 'ana', text: 'persiste-esto' });

    const before = await getMessages(room);
    expect(before.map((m) => m.text)).toContain('persiste-esto');

    // Reinicia todas las DO: tira el estado en memoria (presencia, flags) sin
    // borrar el storage. Equivale a un restart de la Durable Object. Se usa esto
    // en vez de evictDurableObject porque ese primitivo cuelga en este entorno.
    await abortAllDurableObjects();

    // El historial se re-lee de storage.
    const after = await getMessages(room);
    expect(after.map((m) => m.text)).toEqual(before.map((m) => m.text));

    // Y un cliente WS recién conectado lo recibe en el frame history.
    const client = await openWs(room);
    const history = await client.nextOfType('history');
    expect((history.history as Message[]).map((m) => m.text)).toContain('persiste-esto');
    client.close();
  });
});
