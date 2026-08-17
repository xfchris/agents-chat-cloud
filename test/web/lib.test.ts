import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOM_RE } from 'shared/constants';
import { generateRoomCode, isValidRoom } from '../../web/src/lib/room';
import {
  DEFAULT_NAME,
  effectiveName,
  readStoredName,
  storeName,
} from '../../web/src/lib/identity';
import { fetchBrief, fetchMessages, fetchPresence } from '../../web/src/lib/api';
import { makeMessage } from './helpers';

describe('lib/room · generateRoomCode', () => {
  it('produce un código de 12 chars válido contra ROOM_RE', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(12);
    expect(ROOM_RE.test(code)).toBe(true);
  });

  it('usa solo el alfabeto base32 legible (sin 0/1/l/o)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateRoomCode()).toMatch(/^[23456789abcdefghijkmnpqrstuvwxyz]{12}$/);
    }
  });

  it('genera códigos distintos entre llamadas (aleatoriedad)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    // Con 32^12 combinaciones, 20 iguales sería un fallo real, no flakiness.
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('lib/room · isValidRoom', () => {
  it('acepta un código bien formado', () => {
    expect(isValidRoom('equipo-nocturno')).toBe(true);
  });

  it.each([['AB', 'mayúsculas'], ['ab', '<3'], ['sala_1', 'guion bajo']])(
    'rechaza %s (%s)',
    (room) => {
      expect(isValidRoom(room)).toBe(false);
    },
  );
});

describe('lib/identity · effectiveName', () => {
  it('recorta y devuelve el nombre dado', () => {
    expect(effectiveName('  ana  ')).toBe('ana');
  });

  it('cae a `humano` cuando queda vacío', () => {
    expect(effectiveName('')).toBe(DEFAULT_NAME);
    expect(effectiveName('   ')).toBe(DEFAULT_NAME);
    expect(DEFAULT_NAME).toBe('humano');
  });
});

describe('lib/identity · persistencia en localStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('readStoredName devuelve `humano` sin valor guardado', () => {
    expect(readStoredName()).toBe(DEFAULT_NAME);
  });

  it('storeName persiste el nombre efectivo y readStoredName lo recupera', () => {
    storeName('  Rebeca ');
    expect(localStorage.getItem('chatName')).toBe('Rebeca');
    expect(readStoredName()).toBe('Rebeca');
  });

  it('storeName guarda `humano` si el nombre queda vacío', () => {
    storeName('   ');
    expect(readStoredName()).toBe(DEFAULT_NAME);
  });
});

describe('lib/api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchBrief pide /r/<room>/brief y devuelve texto', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: () => Promise.resolve('propósito') });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchBrief('sala-1')).resolves.toBe('propósito');
    expect(fetchMock).toHaveBeenCalledWith('/r/sala-1/brief');
  });

  it('fetchBrief lanza si la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchBrief('sala-1')).rejects.toThrow('404');
  });

  it('fetchMessages sin sinceId no añade query', async () => {
    const msgs = [makeMessage({ id: 1 })];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(msgs) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMessages('sala-1')).resolves.toEqual(msgs);
    expect(fetchMock).toHaveBeenCalledWith('/r/sala-1/messages');
  });

  it('fetchMessages con sinceId añade ?sinceId=', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchMessages('sala-1', 7);
    expect(fetchMock).toHaveBeenCalledWith('/r/sala-1/messages?sinceId=7');
  });

  it('fetchMessages propaga error de estado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchMessages('sala-1')).rejects.toThrow('500');
  });

  it('fetchPresence pide /r/<room>/presence y devuelve la lista', async () => {
    const online = [{ name: 'ana', lastTs: 1 }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(online) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPresence('sala-1')).resolves.toEqual(online);
    expect(fetchMock).toHaveBeenCalledWith('/r/sala-1/presence');
  });

  it('codifica el nombre de sala en la URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchPresence('a b');
    expect(fetchMock).toHaveBeenCalledWith('/r/a%20b/presence');
  });
});
