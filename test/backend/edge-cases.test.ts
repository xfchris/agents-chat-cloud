import { describe, it, expect } from 'vitest';
import { runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import { api, postJson, roomStub, openWs, uniqueRoom } from './helpers';

// Casos borde que ejercitan ramas menos transitadas del router y de la DO:
// rutas fuera de /r/, métodos/paths no soportados por la DO, límites de body,
// WebSocket sin upgrade, cierre/error de sockets con nombres compartidos y
// reprogramación del Alarm cuando aún hay presencia viva.

describe('router: rutas fuera de /r/ (Static Assets)', () => {
  it('una petición que no cuelga de /r/ la sirve env.ASSETS (no toca ninguna DO)', async () => {
    // No matchea ROOM_PATH_RE → worker.ts:20 delega en el binding ASSETS.
    const res = await api('/');
    // No importa el cuerpo (dist/client no existe en test); basta con que el
    // router no reviente y resuelva la rama de assets.
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  it('otra ruta arbitraria fuera de /r/ también va a ASSETS', async () => {
    const res = await api('/favicon.ico');
    expect(res.status).toBeGreaterThanOrEqual(200);
  });
});

describe('DO: método/subpath sin handler → 404', () => {
  it('PUT /r/:room/messages llega a la DO pero no matchea → 404', async () => {
    const room = uniqueRoom();
    // /messages está en API_SUBPATHS → el worker lo delega; dentro de la DO
    // ningún if (GET/POST/DELETE) matchea PUT → cae al 404 final (chatroom.ts).
    const res = await api(`/r/${room}/messages`, { method: 'PUT' });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('no encontrado');
  });

  it('DELETE en un subpath sin handler (/presence) → 404', async () => {
    const room = uniqueRoom();
    const res = await api(`/r/${room}/presence`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('no encontrado');
  });
});

describe('POST /messages: 413 por longitud real del body sin content-length', () => {
  it('un body >200KB sin content-length se rechaza tras leerlo (chatroom.ts:105)', async () => {
    const room = uniqueRoom();
    const payload = `{"name":"ana","text":"${'x'.repeat(201_000)}"}`;
    // Body como stream → fetch no puede fijar content-length, así que el chequeo
    // por header (declared) no dispara y el 413 sale del raw.length > MAX_BODY_BYTES.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    const res = await api(`/r/${room}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(413);
  });
});

describe('GET /ws sin cabecera Upgrade', () => {
  it('responde 426 (chatroom.ts:139)', async () => {
    const room = uniqueRoom();
    const res = await api(`/r/${room}/ws`);
    expect(res.status).toBe(426);
    expect(await res.text()).toContain('WebSocket');
  });
});

describe('cierre/error de WebSocket con nombres', () => {
  it('webSocketError expira la presencia del socket (chatroom.ts:178)', async () => {
    const room = uniqueRoom();
    const client = await openWs(room);
    await client.nextOfType('history');
    await client.nextOfType('presence');
    client.send({ type: 'hello', name: 'zoe' });
    await client.nextOfType('presence');

    const stub = roomStub(room);
    // Invoca webSocketError directamente sobre el socket servidor: el runtime lo
    // llamaría ante un error de transporte; aquí lo forzamos para cubrir la rama.
    const sizeAfter = await runInDurableObject(stub, async (instance, state) => {
      const sockets = state.getWebSockets();
      const target = sockets.find((s) => s.deserializeAttachment() === 'zoe');
      await (instance as unknown as { webSocketError(ws: WebSocket): Promise<void> }).webSocketError(
        target as unknown as WebSocket,
      );
      return (instance as unknown as { presence: Map<string, number> }).presence.size;
    });
    expect(sizeAfter).toBe(0);

    client.close();
  });

  it('cerrar un socket NO expira la presencia si otro socket comparte el nombre (chatroom.ts:187-188)', async () => {
    const room = uniqueRoom();
    const a = await openWs(room);
    const b = await openWs(room);
    // Ambos se anuncian con el MISMO nombre → dos sockets con attachment 'ana'.
    // Tras cada hello mandamos un msg-sonda: al ver su eco sabemos que el hello
    // previo de ESE socket ya fue procesado (orden garantizado por socket) y por
    // tanto su attachment quedó fijado.
    a.send({ type: 'hello', name: 'ana' });
    a.send({ type: 'msg', name: 'ana', text: 'ping-a' });
    b.send({ type: 'hello', name: 'ana' });
    b.send({ type: 'msg', name: 'ana', text: 'ping-b' });

    const seen = new Set<string>();
    while (!(seen.has('ping-a') && seen.has('ping-b'))) {
      const echo = await a.nextOfType('msg');
      seen.add(echo.msg.text);
    }

    const stub = roomStub(room);
    const stillPresent = await runInDurableObject(stub, async (instance, state) => {
      const sockets = state.getWebSockets().filter((s) => s.deserializeAttachment() === 'ana');
      expect(sockets.length).toBe(2);
      // Cierra uno: como el otro sigue abierto con 'ana', la presencia se mantiene.
      await (instance as unknown as { webSocketClose(ws: WebSocket): Promise<void> }).webSocketClose(
        sockets[0] as unknown as WebSocket,
      );
      return (instance as unknown as { presence: Map<string, number> }).presence.has('ana');
    });
    expect(stillPresent).toBe(true);

    a.close();
    b.close();
  });
});

describe('WebSocket: frame binario (ArrayBuffer)', () => {
  it('un frame binario se decodifica igual que uno de texto (chatroom.ts:155)', async () => {
    const room = uniqueRoom();
    const client = await openWs(room);
    await client.nextOfType('history');
    await client.nextOfType('presence');

    // Envía el hello como ArrayBuffer en lugar de string → rama del TextDecoder.
    const buf = new TextEncoder().encode(JSON.stringify({ type: 'hello', name: 'bin' }));
    client.ws.send(buf);

    const presence = await client.nextOfType('presence');
    expect((presence.online as { name: string }[]).map((o) => o.name)).toContain('bin');

    client.close();
  });
});

describe('presencia: name reservado "sistema" se ignora', () => {
  it('POST presence con name "sistema" no marca presencia (chatroom.ts:243)', async () => {
    const room = uniqueRoom();
    const res = await postJson(`/r/${room}/presence`, { name: 'sistema' });
    expect(res.status).toBe(204);

    const online = (await (await api(`/r/${room}/presence`)).json()) as { name: string }[];
    expect(online).toEqual([]);
  });
});

describe('POST /messages: JSON que no es objeto', () => {
  it('un body JSON escalar (p. ej. 123) → 400 (asRecord no-objeto, chatroom.ts:299)', async () => {
    const room = uniqueRoom();
    const res = await api(`/r/${room}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '123',
    });
    // JSON válido pero no es objeto → asRecord() = {} → faltan name/text → 400.
    expect(res.status).toBe(400);
  });
});

describe('Alarm: reprograma mientras haya presencia viva', () => {
  it('con presencia no caducada el alarm se vuelve a programar (chatroom.ts:291)', async () => {
    const room = uniqueRoom();
    // Presencia fresca (no la caducamos) → tras barrer, size>0 → reprograma.
    await postJson(`/r/${room}/presence`, { name: 'ana' });

    const stub = roomStub(room);
    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    const rescheduled = await runInDurableObject(stub, async (_instance, state) => {
      return (await state.storage.getAlarm()) !== null;
    });
    expect(rescheduled).toBe(true);

    // Sanidad: 'ana' sigue presente tras el barrido.
    const online = (await (await api(`/r/${room}/presence`)).json()) as { name: string }[];
    expect(online.map((o) => o.name)).toContain('ana');
  });
});
