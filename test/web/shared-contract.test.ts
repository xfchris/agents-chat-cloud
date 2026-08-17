import { describe, it, expect } from 'vitest';
import {
  NAME_MAX,
  TEXT_MAX,
  PRESENCE_TTL_MS,
  HISTORY_RETENTION,
  ROOM_RE,
} from 'shared/constants';
import type {
  Message,
  PresenceEntry,
  ServerEvent,
  ClientEvent,
} from 'shared/types';

// SPEC 01 — contrato compartido. Se ubica en test/web porque el proyecto `web`
// (jsdom) ejecuta TS puro sin arrastrar el runtime de Workers, y ya expone el
// alias `shared`. No verifica cobertura de shared/ (por diseño no está en el
// include de ningún proyecto): el objetivo es que el contrato tenga un test real.

describe('shared/constants', () => {
  it('fija los valores exactos de la spec', () => {
    expect(NAME_MAX).toBe(80);
    expect(TEXT_MAX).toBe(20000);
    expect(PRESENCE_TTL_MS).toBe(45000);
    expect(HISTORY_RETENTION).toBe(500);
  });
});

describe('ROOM_RE', () => {
  const valid = [
    'sala-1',
    'abc', // mínimo 3 chars
    'a'.repeat(64), // máximo 64 chars
    '123',
    'a-b-c',
    'room-2026',
    '---', // guiones permitidos por el set
  ];

  const invalid = [
    ['', 'vacío'],
    ['ab', '< 3 chars'],
    ['a'.repeat(65), '> 64 chars'],
    ['Sala', 'mayúsculas'],
    ['sala_1', 'guion bajo fuera del set'],
    ['sala 1', 'espacio'],
    ['sala.1', 'punto'],
    ['saláñ', 'acentos/no-ascii'],
    ['SALA-1', 'mayúsculas con guion'],
    [' abc', 'espacio inicial'],
    ['abc\n', 'salto de línea final'],
  ] as const;

  it.each(valid)('acepta %s', (room) => {
    expect(ROOM_RE.test(room)).toBe(true);
  });

  it.each(invalid)('rechaza %s (%s)', (room) => {
    expect(ROOM_RE.test(room)).toBe(false);
  });

  it('no es global (evita estado de lastIndex entre .test())', () => {
    expect(ROOM_RE.global).toBe(false);
  });
});

describe('shared/types', () => {
  it('permite construir un Message válido con la forma de la spec', () => {
    const msg: Message = {
      id: 1,
      ts: '2026-08-17T00:00:00.000Z',
      name: 'ana',
      text: 'hola',
      kind: 'msg',
    };
    expect(msg.kind).toBe('msg');
    const system: Message = { ...msg, id: 2, kind: 'system' };
    expect(system.kind).toBe('system');
  });

  it('permite construir un PresenceEntry válido', () => {
    const entry: PresenceEntry = { name: 'ana', lastTs: Date.now() };
    expect(typeof entry.lastTs).toBe('number');
  });

  it('modela las tres variantes de ServerEvent', () => {
    const msg: Message = {
      id: 1,
      ts: '2026-08-17T00:00:00.000Z',
      name: 'ana',
      text: 'hola',
      kind: 'msg',
    };
    const events: ServerEvent[] = [
      { type: 'history', history: [msg] },
      { type: 'msg', msg },
      { type: 'presence', online: [{ name: 'ana', lastTs: 1 }] },
    ];
    expect(events.map((e) => e.type)).toEqual(['history', 'msg', 'presence']);
  });

  it('modela las tres variantes de ClientEvent', () => {
    const events: ClientEvent[] = [
      { type: 'msg', name: 'ana', text: 'hola' },
      { type: 'hello', name: 'ana' },
      { type: 'heartbeat', name: 'ana' },
    ];
    expect(events.map((e) => e.type)).toEqual(['msg', 'hello', 'heartbeat']);
  });
});
