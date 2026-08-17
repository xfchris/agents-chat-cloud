import { describe, it, expect } from 'vitest';
import type { PresenceEntry } from 'shared/types';
import { openWs, uniqueRoom } from './helpers';

describe('WebSocket', () => {
  it('un cliente recién conectado recibe history y LUEGO presence (en ese orden)', async () => {
    const room = uniqueRoom();
    const client = await openWs(room);

    const first = await client.next();
    const second = await client.next();

    expect(first.type).toBe('history');
    expect(second.type).toBe('presence');

    client.close();
  });

  it('enviar {type:msg} se difunde como {type:msg,msg} a todos los sockets de la sala', async () => {
    const room = uniqueRoom();
    const a = await openWs(room);
    const b = await openWs(room);

    a.send({ type: 'msg', name: 'ana', text: 'para-todos' });

    const onA = await a.nextOfType('msg');
    const onB = await b.nextOfType('msg');

    expect(onA.msg).toMatchObject({ name: 'ana', text: 'para-todos', kind: 'msg' });
    expect(onB.msg).toMatchObject({ name: 'ana', text: 'para-todos', kind: 'msg' });
    expect(onA.msg.id).toBe(onB.msg.id);

    a.close();
    b.close();
  });

  it('{type:hello} marca presencia y se difunde a la sala', async () => {
    const room = uniqueRoom();
    const client = await openWs(room);
    // Consume los frames iniciales (history + presence vacío) antes del hello,
    // para que el siguiente presence sea el provocado por el hello.
    await client.nextOfType('history');
    await client.nextOfType('presence');

    client.send({ type: 'hello', name: 'ana' });

    const presence = await client.nextOfType('presence');
    expect((presence.online as PresenceEntry[]).map((o) => o.name)).toContain('ana');

    client.close();
  });

  it('un frame con JSON inválido o type desconocido se ignora sin romper', async () => {
    const room = uniqueRoom();
    const client = await openWs(room);
    await client.nextOfType('history');
    await client.nextOfType('presence');

    client.ws.send('esto no es json');
    client.ws.send(JSON.stringify({ type: 'desconocido', foo: 1 }));

    // El socket sigue vivo: un hello posterior aún produce presencia.
    client.send({ type: 'hello', name: 'zoe' });
    const presence = await client.nextOfType('presence');
    expect((presence.online as PresenceEntry[]).map((o) => o.name)).toContain('zoe');

    client.close();
  });
});
