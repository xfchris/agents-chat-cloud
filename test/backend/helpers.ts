import { SELF, env } from 'cloudflare:test';
import type { Message, ServerEvent } from 'shared/types';

// Helpers AAA reutilizables para los tests backend. Todo va contra el runtime de
// Miniflare: `SELF` es el Worker (router + DO reales) y `env.ROOMS` el binding de
// la Durable Object. Host arbitrario: el Worker enruta por pathname.
const BASE = 'https://chat.test';

// Contador para nombres de sala únicos por test → aislamiento sin depender de
// reset() entre tests (cada sala es un idFromName distinto = DO distinta).
let roomCounter = 0;
export function uniqueRoom(prefix = 'sala'): string {
  roomCounter += 1;
  return `${prefix}-${roomCounter}-${Date.now().toString(36)}`;
}

export function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, init);
}

export function postJson(path: string, body: unknown): Promise<Response> {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getMessages(room: string, sinceId?: number): Promise<Message[]> {
  const q = sinceId === undefined ? '' : `?sinceId=${sinceId}`;
  const res = await api(`/r/${room}/messages${q}`);
  return (await res.json()) as Message[];
}

export function roomStub(room: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(room));
}

// ---- WebSocket ----

export interface WsHandle {
  ws: WebSocket;
  next(): Promise<ServerEvent>;
  nextOfType<T extends ServerEvent['type']>(
    type: T,
  ): Promise<Extract<ServerEvent, { type: T }>>;
  send(event: unknown): void;
  close(): void;
}

// Abre un WS a /r/:room/ws y devuelve una cola de eventos ya parseados. El
// servidor emite history+presence nada más aceptar el socket, así que la cola
// bufferiza para no perder frames que lleguen antes de pedirlos.
export async function openWs(room: string): Promise<WsHandle> {
  const res = await api(`/r/${room}/ws`, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`sin webSocket en la respuesta (status ${res.status})`);
  ws.accept();

  const queue: ServerEvent[] = [];
  const waiters: ((e: ServerEvent) => void)[] = [];
  ws.addEventListener('message', (event) => {
    const parsed = JSON.parse(event.data as string) as ServerEvent;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });

  function next(): Promise<ServerEvent> {
    const buffered = queue.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => waiters.push(resolve));
  }

  async function nextOfType<T extends ServerEvent['type']>(
    type: T,
  ): Promise<Extract<ServerEvent, { type: T }>> {
    // Descarta frames de otro tipo (p. ej. presence intercalada) hasta el buscado.
    for (;;) {
      const event = await next();
      if (event.type === type) return event as Extract<ServerEvent, { type: T }>;
    }
  }

  return {
    ws,
    next,
    nextOfType,
    send: (event: unknown) => ws.send(JSON.stringify(event)),
    close: () => ws.close(),
  };
}
