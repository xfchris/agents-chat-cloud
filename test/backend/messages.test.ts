import { describe, it, expect } from 'vitest';
import { runInDurableObject } from 'cloudflare:test';
import type { Message } from 'shared/types';
import { HISTORY_RETENTION } from 'shared/constants';
import { api, postJson, getMessages, roomStub, uniqueRoom } from './helpers';

describe('POST /r/:room/messages', () => {
  it('devuelve 201 con un Message y lo persiste con id incremental', async () => {
    const room = uniqueRoom();

    const res = await postJson(`/r/${room}/messages`, { name: 'ana', text: 'hola' });
    expect(res.status).toBe(201);
    const msg = (await res.json()) as Message;
    // id 1 es el mensaje 'system' de creación de sala; el primero de usuario es 2.
    expect(msg.id).toBe(2);
    expect(msg).toMatchObject({ name: 'ana', text: 'hola', kind: 'msg' });
    expect(typeof msg.ts).toBe('string');

    const res2 = await postJson(`/r/${room}/messages`, { name: 'ben', text: 'mundo' });
    const msg2 = (await res2.json()) as Message;
    expect(msg2.id).toBe(msg.id + 1); // incremental

    const history = await getMessages(room);
    expect(history.map((m) => m.text)).toEqual(['Sala ' + room + ' creada', 'hola', 'mundo']);
  });

  it('400 si falta name', async () => {
    const room = uniqueRoom();
    const res = await postJson(`/r/${room}/messages`, { text: 'sin nombre' });
    expect(res.status).toBe(400);
  });

  it('400 si falta text', async () => {
    const room = uniqueRoom();
    const res = await postJson(`/r/${room}/messages`, { name: 'ana' });
    expect(res.status).toBe(400);
  });

  it('400 si el JSON es inválido', async () => {
    const room = uniqueRoom();
    const res = await api(`/r/${room}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ esto no es json',
    });
    expect(res.status).toBe(400);
  });

  it('413 si el body supera ~200 KB', async () => {
    const room = uniqueRoom();
    const huge = 'x'.repeat(201_000);
    const res = await api(`/r/${room}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ana', text: huge }),
    });
    expect(res.status).toBe(413);
  });
});

describe('POST /r/:room/messages · kind de intervención (SPEC 11)', () => {
  it('con kind:"attention" crea el Message con ese kind', async () => {
    const room = uniqueRoom();
    const res = await postJson(`/r/${room}/messages`, {
      name: 'claudecode-linux',
      text: 'necesito una credencial',
      kind: 'attention',
    });
    expect(res.status).toBe(201);
    const msg = (await res.json()) as Message;
    expect(msg).toMatchObject({ name: 'claudecode-linux', kind: 'attention' });
  });

  it('con kind:"system" lo degrada a "msg" (el cliente no inyecta sistema)', async () => {
    const room = uniqueRoom();
    const res = await postJson(`/r/${room}/messages`, {
      name: 'ana',
      text: 'intento colar un system',
      kind: 'system',
    });
    expect(res.status).toBe(201);
    const msg = (await res.json()) as Message;
    expect(msg.kind).toBe('msg');
  });

  it('sin kind sigue creando "msg" (comportamiento actual intacto)', async () => {
    const room = uniqueRoom();
    const res = await postJson(`/r/${room}/messages`, { name: 'ana', text: 'normal' });
    const msg = (await res.json()) as Message;
    expect(msg.kind).toBe('msg');
  });

  it('con un kind desconocido o no-string cae a "msg"', async () => {
    const room = uniqueRoom();
    const res1 = await postJson(`/r/${room}/messages`, {
      name: 'ana',
      text: 'kind raro',
      kind: 'urgent',
    });
    expect(((await res1.json()) as Message).kind).toBe('msg');

    const res2 = await postJson(`/r/${room}/messages`, {
      name: 'ana',
      text: 'kind numérico',
      kind: 3,
    });
    expect(((await res2.json()) as Message).kind).toBe('msg');
  });
});

describe('GET /r/:room/messages?sinceId', () => {
  it('devuelve solo id > n en orden ascendente', async () => {
    const room = uniqueRoom();
    await postJson(`/r/${room}/messages`, { name: 'a', text: 'm1' }); // id 2
    await postJson(`/r/${room}/messages`, { name: 'a', text: 'm2' }); // id 3
    await postJson(`/r/${room}/messages`, { name: 'a', text: 'm3' }); // id 4

    const since2 = await getMessages(room, 2);
    expect(since2.map((m) => m.id)).toEqual([3, 4]);
    // ascendente
    expect(since2).toEqual([...since2].sort((x, y) => x.id - y.id));

    const since99 = await getMessages(room, 99);
    expect(since99).toEqual([]);
  });
});

describe('aislamiento entre salas', () => {
  it('un mensaje en /r/a no aparece en /r/b', async () => {
    const roomA = uniqueRoom('a');
    const roomB = uniqueRoom('b');

    await postJson(`/r/${roomA}/messages`, { name: 'ana', text: 'solo-en-a' });

    const inB = await getMessages(roomB);
    expect(inB.some((m) => m.text === 'solo-en-a')).toBe(false);
    // b solo tiene su propio mensaje system
    expect(inB.map((m) => m.text)).toEqual([`Sala ${roomB} creada`]);
  });
});

describe('sala nueva (mensaje system)', () => {
  it('arranca con un único mensaje kind:system "Sala <room> creada"', async () => {
    const room = uniqueRoom();
    const history = await getMessages(room);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: 'system', name: 'sistema', text: `Sala ${room} creada` });
  });

  it('el mensaje system no cuenta para presencia', async () => {
    const room = uniqueRoom();
    await getMessages(room); // fuerza la creación de la sala + system
    const res = await api(`/r/${room}/presence`);
    const online = (await res.json()) as unknown[];
    expect(online).toEqual([]);
  });
});

describe('poda de historial a HISTORY_RETENTION', () => {
  it('superar 500 deja exactamente 500 claves msg: y GET messages ≤ 500', async () => {
    const room = uniqueRoom();
    const stub = roomStub(room);

    // Seed: 500 mensajes + seq=500 directamente en storage (evita 500 POSTs).
    await runInDurableObject(stub, async (_instance, state) => {
      const key = (id: number) => `msg:${String(id).padStart(12, '0')}`;
      for (let start = 1; start <= HISTORY_RETENTION; start += 100) {
        const batch: Record<string, Message> = {};
        for (let id = start; id < start + 100 && id <= HISTORY_RETENTION; id++) {
          batch[key(id)] = { id, ts: '', name: 'seed', text: `m${id}`, kind: 'msg' };
        }
        await state.storage.put(batch);
      }
      await state.storage.put({ seq: HISTORY_RETENTION });
    });

    // Un POST más → id 501 → dispara appendMessage + pruneHistory.
    const res = await postJson(`/r/${room}/messages`, { name: 'ana', text: 'el-501' });
    expect(res.status).toBe(201);

    // Exactamente 500 claves msg: en storage.
    const keyCount = await runInDurableObject(stub, async (_i, state) => {
      const listed = await state.storage.list({ prefix: 'msg:' });
      return listed.size;
    });
    expect(keyCount).toBe(HISTORY_RETENTION);

    // GET messages no devuelve más de 500 y el más antiguo (id 1) fue podado.
    const history = await getMessages(room);
    expect(history.length).toBeLessThanOrEqual(HISTORY_RETENTION);
    expect(history.some((m) => m.id === 1)).toBe(false);
    expect(history.at(-1)?.text).toBe('el-501');
  });
});
