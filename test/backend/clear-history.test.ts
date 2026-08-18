import { describe, it, expect } from 'vitest';
import type { Message } from 'shared/types';
import { api, postJson, getMessages, uniqueRoom, openWs } from './helpers';

function clear(room: string): Promise<Response> {
  return api(`/r/${room}/messages`, { method: 'DELETE' });
}

describe('DELETE /r/:room/messages · borrar historial', () => {
  it('vacía el historial y deja solo el system message "Historial borrado"', async () => {
    const room = uniqueRoom();
    await postJson(`/r/${room}/messages`, { name: 'ana', text: 'uno' });
    await postJson(`/r/${room}/messages`, { name: 'ben', text: 'dos' });

    const res = await clear(room);
    expect(res.status).toBe(200);

    const history = await getMessages(room);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      kind: 'system',
      name: 'sistema',
      text: 'Historial borrado',
    });
  });

  it('responde 200 con { cleared: <n> } contando los mensajes borrados', async () => {
    const room = uniqueRoom();
    // 1 system (creación) + 2 de usuario = 3 claves msg: a borrar.
    await postJson(`/r/${room}/messages`, { name: 'ana', text: 'uno' });
    await postJson(`/r/${room}/messages`, { name: 'ben', text: 'dos' });

    const res = await clear(room);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: 3 });
  });

  it('no reinicia seq: el system message recibe el siguiente id monótono', async () => {
    const room = uniqueRoom();
    const posted = (await (
      await postJson(`/r/${room}/messages`, { name: 'ana', text: 'uno' })
    ).json()) as Message;
    // id 1 = creación, id 2 = 'uno'.
    expect(posted.id).toBe(2);

    await clear(room);

    const history = await getMessages(room);
    expect(history[0].id).toBe(3);
    // Un agente que sondea con el id viejo aún ve el system message.
    const since = await getMessages(room, 2);
    expect(since.map((m) => m.text)).toEqual(['Historial borrado']);
  });

  it('es idempotente en una sala ya vacía (borra 0, sigue añadiendo el system)', async () => {
    const room = uniqueRoom();
    // Solo existe el system de creación; lo borramos primero.
    const first = await clear(room);
    expect(await first.json()).toEqual({ cleared: 1 });

    // Segundo borrado: solo queda el "Historial borrado" del primero → borra 1.
    const second = await clear(room);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ cleared: 1 });

    const history = await getMessages(room);
    expect(history).toHaveLength(1);
    expect(history[0].text).toBe('Historial borrado');
  });

  it('difunde { type: "cleared" } por WS a los conectados', async () => {
    const room = uniqueRoom();
    await postJson(`/r/${room}/messages`, { name: 'ana', text: 'uno' });

    const ws = await openWs(room);
    // Descarta history + presence iniciales.
    await ws.nextOfType('history');

    await clear(room);

    const cleared = await ws.nextOfType('cleared');
    expect(cleared).toEqual({ type: 'cleared' });
    // Tras el cleared llega el system message como {type:'msg'}.
    const msg = await ws.nextOfType('msg');
    expect(msg.msg.text).toBe('Historial borrado');
    ws.close();
  });

  it('una nueva conexión tras el borrado recibe el historial ya vacío', async () => {
    const room = uniqueRoom();
    await postJson(`/r/${room}/messages`, { name: 'ana', text: 'uno' });
    await clear(room);

    const ws = await openWs(room);
    const history = await ws.nextOfType('history');
    expect(history.history.map((m) => m.text)).toEqual(['Historial borrado']);
    ws.close();
  });

  it('borrar una sala no afecta a otra (aislamiento de la DO)', async () => {
    const roomA = uniqueRoom('a');
    const roomB = uniqueRoom('b');
    await postJson(`/r/${roomA}/messages`, { name: 'ana', text: 'en-a' });
    await postJson(`/r/${roomB}/messages`, { name: 'ben', text: 'en-b' });

    await clear(roomA);

    const inB = await getMessages(roomB);
    expect(inB.map((m) => m.text)).toEqual([`Sala ${roomB} creada`, 'en-b']);
  });

  it('DELETE está en Access-Control-Allow-Methods y el preflight lo permite', async () => {
    const room = uniqueRoom();
    const res = await api(`/r/${room}/messages`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });

  it('el brief documenta el curl -X DELETE de borrado', async () => {
    const room = uniqueRoom('brief');
    const body = await (await api(`/r/${room}/brief`)).text();
    expect(body).toContain('borrar historial');
    expect(body).toContain(`curl -s -X DELETE https://chat.test/r/${room}/messages`);
  });
});
