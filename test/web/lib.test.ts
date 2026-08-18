import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOM_RE } from 'shared/constants';
import { generateRoomCode, isValidRoom } from '../../web/src/lib/room';
import {
  DEFAULT_NAME,
  effectiveName,
  kindIcon,
  parseIdentity,
  readStoredName,
  storeName,
} from '../../web/src/lib/identity';
import { fetchBrief, fetchMessages, fetchPresence } from '../../web/src/lib/api';
import { applyTheme, resolveTheme, storeTheme } from '../../web/src/lib/theme';
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

describe('lib/identity · parseIdentity (agentes)', () => {
  it('claudecode-linux → agente 🤖 (os linux) con label sin sufijo', () => {
    const id = parseIdentity('claudecode-linux');
    expect(id).toEqual({
      kind: 'agent',
      label: 'claudecode',
      robot: true,
      os: 'linux',
      app: 'claudecode',
    });
    expect(id.suffix).toBeUndefined();
    expect(kindIcon(id)).toBe('🤖');
  });

  it('opencode-mac → os mac con app opencode', () => {
    const id = parseIdentity('opencode-mac');
    expect(id.kind).toBe('agent');
    expect(id.os).toBe('mac');
    expect(id.app).toBe('opencode');
    expect(id.label).toBe('opencode');
  });

  it('codex-windows → os windows con app codex', () => {
    const id = parseIdentity('codex-windows');
    expect(id.kind).toBe('agent');
    expect(id.os).toBe('windows');
    expect(id.app).toBe('codex');
    expect(id.label).toBe('codex');
  });

  it.each([
    ['x-macos', 'mac'],
    ['x-darwin', 'mac'],
    ['x-win', 'windows'],
    ['x-linux', 'linux'],
  ])('alias %s normaliza a os %s', (name, os) => {
    const id = parseIdentity(name);
    expect(id.kind).toBe('agent');
    expect(id.os).toBe(os);
  });

  it('claudecode-linux_2 → label con sufijo y campo suffix', () => {
    const id = parseIdentity('claudecode-linux_2');
    expect(id.label).toBe('claudecode_2');
    expect(id.suffix).toBe('2');
    expect(id.os).toBe('linux');
    expect(id.app).toBe('claudecode');
    expect(kindIcon(id)).toBe('🤖');
  });
});

describe('lib/identity · parseIdentity (humanos y fallbacks)', () => {
  it.each([
    ['humano', 'humano por defecto'],
    ['ana', 'nombre simple sin convención'],
    ['claudecode-freebsd', 'SO no reconocido'],
    ['ClaudeCode-Linux', 'mayúsculas no casan la convención'],
  ])('%s → humano 👤 con label = name (%s)', (name) => {
    const id = parseIdentity(name);
    expect(id.kind).toBe('human');
    expect(id.robot).toBe(false);
    expect(id.label).toBe(name);
    expect(id.os).toBeUndefined();
    expect(id.app).toBeUndefined();
    expect(id.suffix).toBeUndefined();
    expect(kindIcon(id)).toBe('👤');
  });
});

describe('lib/theme · resolveTheme', () => {
  // Instala un `matchMedia` mockeado que responde `matches` según `dark`.
  function mockMatchMedia(dark: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: dark,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      })),
    });
  }

  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    } else {
      // jsdom no trae matchMedia: lo eliminamos si lo instalamos en el test.
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
    vi.restoreAllMocks();
  });

  it('con localStorage["theme"]="light" devuelve "light" (ignora el sistema)', () => {
    localStorage.setItem('theme', 'light');
    mockMatchMedia(true); // sistema oscuro, pero manda la elección explícita
    expect(resolveTheme()).toBe('light');
  });

  it('con localStorage["theme"]="dark" devuelve "dark" (ignora el sistema)', () => {
    localStorage.setItem('theme', 'dark');
    mockMatchMedia(false); // sistema claro, pero manda la elección explícita
    expect(resolveTheme()).toBe('dark');
  });

  it('con valor corrupto ("azul") lo ignora y cae al sistema', () => {
    localStorage.setItem('theme', 'azul');
    mockMatchMedia(false);
    expect(resolveTheme()).toBe('light');
    localStorage.setItem('theme', 'azul');
    mockMatchMedia(true);
    expect(resolveTheme()).toBe('dark');
  });

  it('sin elección guardada sigue al sistema: prefers-color-scheme dark → "dark"', () => {
    mockMatchMedia(true);
    expect(resolveTheme()).toBe('dark');
  });

  it('sin elección guardada sigue al sistema: prefers-color-scheme light → "light"', () => {
    mockMatchMedia(false);
    expect(resolveTheme()).toBe('light');
  });

  it('sin matchMedia disponible cae al fallback "dark" (tema base)', () => {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    expect(resolveTheme()).toBe('dark');
  });

  it('si matchMedia lanza, no propaga y cae a "dark"', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => {
        throw new Error('boom');
      }),
    });
    expect(() => resolveTheme()).not.toThrow();
    expect(resolveTheme()).toBe('dark');
  });

  it('si localStorage.getItem lanza, no propaga y resuelve por el sistema', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('sin storage');
    });
    mockMatchMedia(false);
    expect(() => resolveTheme()).not.toThrow();
    expect(resolveTheme()).toBe('light');
  });
});

describe('lib/theme · applyTheme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('escribe data-theme="light" en la raíz del documento', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('escribe data-theme="dark" en la raíz del documento', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('lib/theme · storeTheme', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('persiste la elección en localStorage["theme"]', () => {
    storeTheme('light');
    expect(localStorage.getItem('theme')).toBe('light');
    storeTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('si setItem lanza (modo privado), falla en silencio sin propagar', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => storeTheme('light')).not.toThrow();
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
