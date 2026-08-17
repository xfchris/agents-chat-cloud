import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { ClientEvent, Message, PresenceEntry, ServerEvent } from 'shared/types';

// WebSocket mock controlable: reemplaza `globalThis.WebSocket`. Cada instancia se
// registra para que el test dispare a mano open/message/close e inspeccione lo
// enviado. Refleja el ciclo real que consume `useChat` sin red de por medio.

export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  // Registro global de instancias creadas, en orden de apertura.
  static instances: MockWebSocket[] = [];

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static get last(): MockWebSocket {
    const ws = MockWebSocket.instances.at(-1);
    if (!ws) throw new Error('No se ha creado ningún WebSocket');
    return ws;
  }

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;
  sent: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn((data: string) => {
    this.sent.push(data);
  });

  close = vi.fn(() => {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });

  /** Olvida lo enviado hasta ahora (mock + array), para asserts limpios. */
  clearSent(): void {
    this.sent.length = 0;
    this.send.mockClear();
  }

  // --- control manual desde el test ---

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emit(event: ServerEvent): void {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>);
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  // Cierre "desde el servidor": lo usa el test para simular caída de red.
  serverClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  error(): void {
    this.onerror?.();
  }

  /** Eventos de cliente parseados de lo enviado, para asserts limpios. */
  get clientEvents(): ClientEvent[] {
    return this.sent.map((raw) => JSON.parse(raw) as ClientEvent);
  }
}

/** Instala el mock en el global y devuelve un limpiador para el `afterEach`. */
export function installMockWebSocket(): () => void {
  const original = globalThis.WebSocket;
  MockWebSocket.reset();
  // @ts-expect-error el mock cubre la superficie que usa useChat.
  globalThis.WebSocket = MockWebSocket;
  return () => {
    // @ts-expect-error restauramos el original (puede ser undefined en jsdom).
    globalThis.WebSocket = original;
    MockWebSocket.reset();
  };
}

/** Render con `MemoryRouter` en la ruta indicada (por defecto `/`). */
export function renderWithRouter(
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

// --- fábricas de datos ---

let seq = 0;

export function makeMessage(over: Partial<Message> = {}): Message {
  seq += 1;
  return {
    id: over.id ?? seq,
    ts: over.ts ?? '2026-08-17T10:00:00.000Z',
    name: over.name ?? 'ana',
    text: over.text ?? 'hola',
    kind: over.kind ?? 'msg',
  };
}

export function makePresence(name: string, lastTs = Date.now()): PresenceEntry {
  return { name, lastTs };
}
