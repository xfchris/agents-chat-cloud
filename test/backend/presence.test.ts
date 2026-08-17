import { describe, it, expect } from 'vitest';
import { runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import type { PresenceEntry } from 'shared/types';
import { PRESENCE_TTL_MS } from 'shared/constants';
import { api, postJson, roomStub, uniqueRoom } from './helpers';

async function getPresence(room: string): Promise<PresenceEntry[]> {
  const res = await api(`/r/${room}/presence`);
  return (await res.json()) as PresenceEntry[];
}

describe('POST /r/:room/presence', () => {
  it('marca presencia: name aparece en GET presence (204 sin cuerpo)', async () => {
    const room = uniqueRoom();
    const res = await postJson(`/r/${room}/presence`, { name: 'ana' });
    expect(res.status).toBe(204);

    const online = await getPresence(room);
    expect(online.map((o) => o.name)).toContain('ana');
  });

  it('body no-JSON o sin name → 204 sin marcar (paridad con el local)', async () => {
    const room = uniqueRoom();

    const bad = await api(`/r/${room}/presence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'no-json',
    });
    expect(bad.status).toBe(204);

    const noName = await postJson(`/r/${room}/presence`, { foo: 1 });
    expect(noName.status).toBe(204);

    expect(await getPresence(room)).toEqual([]);
  });

  it('orden alfabético por name', async () => {
    const room = uniqueRoom();
    await postJson(`/r/${room}/presence`, { name: 'carla' });
    await postJson(`/r/${room}/presence`, { name: 'ana' });
    await postJson(`/r/${room}/presence`, { name: 'bruno' });

    const online = await getPresence(room);
    expect(online.map((o) => o.name)).toEqual(['ana', 'bruno', 'carla']);
  });
});

describe('expiración de presencia por TTL', () => {
  it('tras PRESENCE_TTL_MS sin señal deja de aparecer en GET presence', async () => {
    const room = uniqueRoom();
    await postJson(`/r/${room}/presence`, { name: 'ana' });
    expect((await getPresence(room)).map((o) => o.name)).toContain('ana');

    // Avanza el "reloj" retrasando la última señal más allá del TTL. Se hace así
    // porque vi.useFakeTimers no controla el Date.now() de workerd de forma
    // fiable; backdatear la señal es equivalente a que pase el tiempo.
    await runInDurableObject(roomStub(room), (instance) => {
      const presence = (instance as unknown as { presence: Map<string, number> }).presence;
      presence.set('ana', Date.now() - (PRESENCE_TTL_MS + 1000));
    });

    expect(await getPresence(room)).toEqual([]);
  });

  it('el Alarm barre las entradas caducadas del mapa en memoria', async () => {
    const room = uniqueRoom();
    // markPresent programa el Alarm; POST presence lo dispara.
    await postJson(`/r/${room}/presence`, { name: 'ana' });

    const stub = roomStub(room);
    // Caduca la señal de ana.
    await runInDurableObject(stub, (instance) => {
      const presence = (instance as unknown as { presence: Map<string, number> }).presence;
      presence.set('ana', Date.now() - (PRESENCE_TTL_MS + 1000));
    });

    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    const size = await runInDurableObject(stub, (instance) => {
      return (instance as unknown as { presence: Map<string, number> }).presence.size;
    });
    expect(size).toBe(0);
  });
});
