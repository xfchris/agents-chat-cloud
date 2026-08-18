import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChat } from '../../web/src/hooks/useChat';
import { installMockWebSocket, MockWebSocket, makeMessage, makePresence } from './helpers';

// Núcleo de la SPEC 03: aislamos el WebSocket con el mock controlable y usamos
// fake timers para heartbeat (15s), debounce de nombre (500ms) y backoff (~1.5s).

let restoreWs: () => void;

beforeEach(() => {
  restoreWs = installMockWebSocket();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  restoreWs();
});

describe('useChat · conexión', () => {
  it('abre el WS a /r/<room>/ws al montar y arranca en connecting', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.last.url).toMatch(/\/r\/sala-1\/ws$/);
    expect(result.current.status).toBe('connecting');
  });

  it('codifica el nombre de sala en la URL del WS', () => {
    renderHook(() => useChat('a b', 'ana'));
    expect(MockWebSocket.last.url).toMatch(/\/r\/a%20b\/ws$/);
  });

  it('al abrirse pasa a connected y emite un hello con el nombre efectivo', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));

    act(() => MockWebSocket.last.open());

    expect(result.current.status).toBe('connected');
    expect(MockWebSocket.last.clientEvents).toEqual([{ type: 'hello', name: 'ana' }]);
  });

  it('el nombre efectivo es `humano` si el nombre está vacío', () => {
    const { result } = renderHook(() => useChat('sala-1', '   '));
    act(() => MockWebSocket.last.open());

    expect(result.current.myName).toBe('humano');
    expect(MockWebSocket.last.clientEvents).toEqual([{ type: 'hello', name: 'humano' }]);
  });
});

describe('useChat · eventos entrantes', () => {
  it('history puebla los mensajes en orden', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    const history = [makeMessage({ id: 1, text: 'uno' }), makeMessage({ id: 2, text: 'dos' })];

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({ type: 'history', history });
    });

    expect(result.current.messages.map((m) => m.text)).toEqual(['uno', 'dos']);
  });

  it('msg añade un mensaje entrante', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({ type: 'msg', msg: makeMessage({ id: 5, text: 'nuevo' }) });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('nuevo');
  });

  it('deduplica por id: un msg con id ya visto no se añade', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    const dup = makeMessage({ id: 7, text: 'orig' });

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({ type: 'msg', msg: dup });
      MockWebSocket.last.emit({ type: 'msg', msg: { ...dup, text: 'copia' } });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe('orig');
  });

  it('presence actualiza la lista de online', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'presence',
        online: [makePresence('ana'), makePresence('bruno')],
      });
    });

    expect(result.current.online.map((e) => e.name)).toEqual(['ana', 'bruno']);
  });

  it('cleared vacía los mensajes y admite el system message posterior', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'history',
        history: [makeMessage({ id: 1, text: 'uno' }), makeMessage({ id: 2, text: 'dos' })],
      });
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => MockWebSocket.last.emit({ type: 'cleared' }));
    expect(result.current.messages).toEqual([]);

    // El system message que difunde el backend tras el cleared entra pese a que
    // su id (3) es mayor que los ya vistos: el dedup se reinició.
    act(() => {
      MockWebSocket.last.emit({
        type: 'msg',
        msg: makeMessage({ id: 3, name: 'sistema', text: 'Historial borrado', kind: 'system' }),
      });
    });
    expect(result.current.messages.map((m) => m.text)).toEqual(['Historial borrado']);
  });

  it('ignora payloads no-JSON sin romper', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emitRaw('esto no es json {');
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('connected');
  });
});

describe('useChat · envío', () => {
  it('sendMessage emite {type:msg,name,text} recortado por WS', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    act(() => MockWebSocket.last.open());

    act(() => result.current.sendMessage('  hola mundo  '));

    expect(MockWebSocket.last.clientEvents).toContainEqual({
      type: 'msg',
      name: 'ana',
      text: 'hola mundo',
    });
  });

  it('sendMessage ignora texto vacío', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    act(() => MockWebSocket.last.open());
    MockWebSocket.last.clearSent();

    act(() => result.current.sendMessage('   '));

    expect(MockWebSocket.last.send).not.toHaveBeenCalled();
  });

  it('no envía si el socket no está OPEN', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    // No abrimos: readyState sigue CONNECTING.

    act(() => result.current.sendMessage('hola'));

    expect(MockWebSocket.last.send).not.toHaveBeenCalled();
  });
});

describe('useChat · heartbeat', () => {
  it('emite un heartbeat cada 15s con el nombre vigente', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    act(() => MockWebSocket.last.open());
    MockWebSocket.last.clearSent();

    act(() => vi.advanceTimersByTime(15000));

    expect(MockWebSocket.last.clientEvents.filter((e) => e.type === 'heartbeat')).toEqual([
      { type: 'heartbeat', name: 'ana' },
    ]);
    expect(result.current.status).toBe('connected');
  });
});

describe('useChat · reconexión', () => {
  it('al cerrarse el WS pasa a disconnected y reintenta tras el backoff', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    act(() => MockWebSocket.last.open());
    expect(result.current.status).toBe('connected');

    act(() => MockWebSocket.last.serverClose());
    expect(result.current.status).toBe('disconnected');
    expect(MockWebSocket.instances).toHaveLength(1);

    // El backoff mínimo es 1500ms + jitter (≤30%). Avanzamos de sobra.
    act(() => vi.advanceTimersByTime(2000));

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(result.current.status).toBe('connecting');

    act(() => MockWebSocket.last.open());
    expect(result.current.status).toBe('connected');
  });

  it('el onclose de un socket viejo no pisa el status del nuevo (guard)', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    const first = MockWebSocket.last;
    act(() => first.open());

    // Cae y reconecta.
    act(() => first.serverClose());
    act(() => vi.advanceTimersByTime(2000));
    const second = MockWebSocket.last;
    act(() => second.open());
    expect(result.current.status).toBe('connected');

    // Un onclose tardío del socket viejo NO debe degradar el status del nuevo.
    act(() => first.onclose?.());
    expect(result.current.status).toBe('connected');
  });

  it('dedup evita duplicar al reconectar cuando se reenvía history', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    const history = [makeMessage({ id: 1 }), makeMessage({ id: 2 })];

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({ type: 'history', history });
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => MockWebSocket.last.serverClose());
    act(() => vi.advanceTimersByTime(2000));
    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({ type: 'history', history });
    });

    expect(result.current.messages).toHaveLength(2);
  });
});

describe('useChat · reanuncio de nombre (debounce)', () => {
  it('cambiar el nombre reanuncia un solo hello con el valor final', () => {
    const { result, rerender } = renderHook(({ name }) => useChat('sala-1', name), {
      initialProps: { name: 'a' },
    });
    act(() => MockWebSocket.last.open());
    MockWebSocket.last.clearSent();

    // Simula tecleo: varios cambios rápidos de nombre.
    rerender({ name: 'an' });
    rerender({ name: 'ana' });
    // Antes del debounce no se ha emitido ningún hello parcial.
    expect(MockWebSocket.last.send).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));

    const hellos = MockWebSocket.last.clientEvents.filter((e) => e.type === 'hello');
    expect(hellos).toEqual([{ type: 'hello', name: 'ana' }]);
    expect(result.current.myName).toBe('ana');
  });

  it('no emite hello adicional si el nombre efectivo no cambia', () => {
    const { rerender } = renderHook(({ name }) => useChat('sala-1', name), {
      initialProps: { name: 'ana' },
    });
    act(() => MockWebSocket.last.open());
    MockWebSocket.last.clearSent();

    // Mismo nombre efectivo (solo espacios): no debe reanunciar.
    rerender({ name: 'ana' });
    act(() => vi.advanceTimersByTime(1000));

    expect(MockWebSocket.last.send).not.toHaveBeenCalled();
  });
});

describe('useChat · cota de mensajes', () => {
  it('poda a los 1000 más recientes y realinea el dedup', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));
    act(() => MockWebSocket.last.open());

    // 1001 mensajes: debe conservar los últimos 1000 (ids 2..1001).
    act(() => {
      for (let id = 1; id <= 1001; id += 1) {
        MockWebSocket.last.emit({ type: 'msg', msg: makeMessage({ id, text: `m${id}` }) });
      }
    });

    expect(result.current.messages).toHaveLength(1000);
    expect(result.current.messages[0].id).toBe(2);
    expect(result.current.messages.at(-1)?.id).toBe(1001);

    // El id podado (1) ya no está en `seen`: reingresarlo lo vuelve a añadir.
    act(() => {
      MockWebSocket.last.emit({ type: 'msg', msg: makeMessage({ id: 1, text: 'revivido' }) });
    });
    expect(result.current.messages.at(-1)?.id).toBe(1);
    expect(result.current.messages).toHaveLength(1000);
  });
});

describe('useChat · limpieza', () => {
  it('al desmontar cierra el socket y no reconecta', () => {
    const { unmount } = renderHook(() => useChat('sala-1', 'ana'));
    const ws = MockWebSocket.last;
    act(() => ws.open());

    act(() => unmount());

    expect(ws.close).toHaveBeenCalled();
    // Tras desmontar, el timer de reconexión no debe crear sockets nuevos.
    act(() => vi.advanceTimersByTime(5000));
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
