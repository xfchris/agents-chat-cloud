import { describe, it, expect } from 'vitest';
import { env, listDurableObjectIds } from 'cloudflare:test';
import { api, uniqueRoom } from './helpers';

describe('validación de room (ROOM_RE) en el Worker', () => {
  const invalid = ['AB', 'x', 'Sala', 'con_guion', 'a'.repeat(65)];

  for (const room of invalid) {
    it(`404 en /r/${room}/messages (API)`, async () => {
      const res = await api(`/r/${room}/messages`);
      expect(res.status).toBe(404);
    });
    it(`404 en /r/${room} pelado (navegación)`, async () => {
      const res = await api(`/r/${room}`);
      expect(res.status).toBe(404);
    });
  }

  it('404 sin tocar ninguna DO (room inválida no crea instancia)', async () => {
    await api('/r/AB/ws', { headers: { Upgrade: 'websocket' } });
    const ids = (await listDurableObjectIds(env.ROOMS)).map((i) => i.toString());
    expect(ids).not.toContain(env.ROOMS.idFromName('AB').toString());
  });
});

describe('routing SPA vs API', () => {
  it('GET /r/<room-válido> pelado NO va a la DO (lo sirve Static Assets)', async () => {
    const room = uniqueRoom('spa');
    // Con dist/client presente esto serviría index.html; en el entorno de test
    // ASSETS no tiene build, pero lo que importa es la decisión de routing: el
    // Worker NO instancia la DO de la sala para una ruta pelada.
    await api(`/r/${room}`);

    const ids = (await listDurableObjectIds(env.ROOMS)).map((i) => i.toString());
    expect(ids).not.toContain(env.ROOMS.idFromName(room).toString());
  });

  it('un subpath de API SÍ instancia la DO de la sala', async () => {
    const room = uniqueRoom('apihit');
    await api(`/r/${room}/messages`);

    const ids = (await listDurableObjectIds(env.ROOMS)).map((i) => i.toString());
    expect(ids).toContain(env.ROOMS.idFromName(room).toString());
  });
});

describe('CORS', () => {
  it('OPTIONS /r/:room/messages → 204 con CORS *', async () => {
    const room = uniqueRoom();
    const res = await api(`/r/${room}/messages`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('las respuestas de API llevan CORS *', async () => {
    const room = uniqueRoom();
    const res = await api(`/r/${room}/messages`);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('GET /r/:room/brief', () => {
  it('200 text/plain con el <room> real y la sección de presencia', async () => {
    const room = uniqueRoom('brief');
    const res = await api(`/r/${room}/brief`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain(room);
    expect(body).toContain('Presencia');
  });

  it('instruye la convención de nombre <app>-<os> y el sufijo de unicidad', () => {
    return api(`/r/${uniqueRoom('brief')}/brief`)
      .then((res) => res.text())
      .then((body) => {
        // Convención de identidad de SPEC 06.
        expect(body).toContain('<app>-<os>');
        // SO reconocidos que la web sabe pintar.
        expect(body).toMatch(/linux/);
        expect(body).toMatch(/mac/);
        expect(body).toMatch(/windows/);
        // Sufijo de unicidad cuando el nombre ya está en línea.
        expect(body).toMatch(/_2/);
      });
  });

  it('documenta cómo pedir intervención humana con kind:"attention" (SPEC 11)', () => {
    return api(`/r/${uniqueRoom('brief')}/brief`)
      .then((res) => res.text())
      .then((body) => {
        expect(body).toContain('pedir intervención humana');
        // El ejemplo lleva el campo kind:"attention" en el curl.
        expect(body).toContain('"kind":"attention"');
      });
  });
});
