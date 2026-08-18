import type { Message, MessageKind, PresenceEntry, ServerEvent } from 'shared/types';
import { HISTORY_RETENTION, NAME_MAX, PRESENCE_TTL_MS, TEXT_MAX } from 'shared/constants';

// Bindings del Worker. Se declaran aquí porque la DO es la fuente de la clase y
// el router (worker.ts) los reutiliza vía `import type`.
export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

// Cada cuánto barre la presencia el Alarm. La DO hibernable no tiene setInterval,
// así que el Alarm se reprograma mientras haya presencia viva.
const PRESENCE_SWEEP_MS = 10000;

// Tope del body de POST /messages (~200 KB): superarlo responde 413 (no se
// trunca, truncar el JSON lo invalidaría). Con TEXT_MAX=20000 solo afecta a abuso.
const MAX_BODY_BYTES = 200000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function messageKey(id: number): string {
  return `msg:${String(id).padStart(12, '0')}`;
}

/**
 * Durable Object de una sala de chat: WebSocket (Hibernation), historial en
 * `state.storage` y presencia efímera en memoria podada por Alarm. Porta la
 * semántica de `agents-chat/server.js`, una sala por objeto.
 */
export class ChatRoom {
  private readonly state: DurableObjectState;

  // Presencia SOLO en memoria: se reconstruye con hello/heartbeat/POST tras hibernar.
  private readonly presence = new Map<string, number>();
  private lastOnlineKey = '';
  // Evita releer `seq` en cada request; se reevalúa gratis tras hibernar.
  private initialized = false;

  // La DO no consume bindings (`env`); el runtime lo pasa como 2º arg y se ignora.
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    const room = request.headers.get('x-room') ?? '';
    await this.ensureRoom(room);

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/ws') {
      return this.handleWebSocketUpgrade(request);
    }
    if (request.method === 'GET' && path === '/brief') {
      return cors(
        new Response(buildBrief(url.origin, room), {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      );
    }
    if (request.method === 'GET' && path === '/messages') {
      return this.handleGetMessages(url);
    }
    if (request.method === 'POST' && path === '/messages') {
      return this.handlePostMessage(request);
    }
    if (request.method === 'GET' && path === '/presence') {
      return json(this.onlineList());
    }
    if (request.method === 'POST' && path === '/presence') {
      return this.handlePostPresence(request);
    }

    return cors(new Response('no encontrado', { status: 404 }));
  }

  // ---- HTTP handlers ----

  private async handleGetMessages(url: URL): Promise<Response> {
    let messages = await this.loadHistory();
    const sinceId = url.searchParams.get('sinceId');
    if (sinceId !== null) {
      const since = Number.parseInt(sinceId, 10);
      if (!Number.isNaN(since)) messages = messages.filter((m) => m.id > since);
    }
    return json(messages);
  }

  private async handlePostMessage(request: Request): Promise<Response> {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return cors(new Response('Body demasiado grande', { status: 413 }));
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return cors(new Response('Body demasiado grande', { status: 413 }));
    }
    let data: unknown;
    try {
      data = JSON.parse(raw || '{}');
    } catch {
      return cors(new Response('JSON inválido', { status: 400 }));
    }
    const { name, text, kind } = asRecord(data);
    // Rechazar name/text no-string con 400 es intencional: más estricto que el
    // server.js local, pero deja un contrato más limpio para los clientes.
    if (!name || !text) {
      return cors(new Response('Faltan "name" o "text"', { status: 400 }));
    }
    // Solo `attention` es inyectable por el cliente; `system` (y cualquier otro
    // valor, ausente o no-string) cae a `msg`: el sistema es el único que emite
    // mensajes de sistema.
    const resolvedKind: MessageKind = kind === 'attention' ? 'attention' : 'msg';
    const msg = await this.appendMessage({ name, text, kind: resolvedKind });
    return json(msg, 201);
  }

  private async handlePostPresence(request: Request): Promise<Response> {
    let data: unknown;
    try {
      data = JSON.parse((await request.text()) || '{}');
    } catch {
      data = {};
    }
    const { name } = asRecord(data);
    if (name) this.markPresent(String(name));
    return cors(new Response(null, { status: 204 }));
  }

  // ---- WebSocket (Hibernation) ----

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return cors(new Response('Se esperaba una conexión WebSocket', { status: 426 }));
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);

    const history = await this.loadHistory();
    send(server, { type: 'history', history });
    send(server, { type: 'presence', online: this.onlineList() });
    void this.scheduleSweep();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // JSON inválido: se ignora en silencio
    }
    const event = asRecord(data);
    if (event.type === 'msg' && event.name && event.text) {
      ws.serializeAttachment(String(event.name).slice(0, NAME_MAX));
      await this.appendMessage({ name: event.name, text: event.text, kind: 'msg' });
    } else if ((event.type === 'hello' || event.type === 'heartbeat') && event.name) {
      ws.serializeAttachment(String(event.name).slice(0, NAME_MAX));
      this.markPresent(String(event.name));
    }
    // type desconocido: se ignora en silencio
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.expirePresenceFor(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.expirePresenceFor(ws);
  }

  private expirePresenceFor(ws: WebSocket): void {
    const name = ws.deserializeAttachment() as string | null;
    if (!name) return;
    // Solo expira si este era el último socket con ese nombre.
    const stillOpen = this.state
      .getWebSockets()
      .some((s) => s !== ws && s.deserializeAttachment() === name);
    if (stillOpen) return;
    this.presence.delete(name);
    this.broadcastPresenceIfChanged();
  }

  // ---- Historial ----

  private async appendMessage(input: {
    name: unknown;
    text: unknown;
    kind?: MessageKind;
  }): Promise<Message> {
    const id = ((await this.state.storage.get<number>('seq')) ?? 0) + 1;
    const msg: Message = {
      id,
      ts: new Date().toISOString(),
      name: String(input.name || 'anónimo').slice(0, NAME_MAX),
      text: String(input.text == null ? '' : input.text).slice(0, TEXT_MAX),
      kind: input.kind ?? 'msg',
    };
    // Escritura atómica: seq y el mensaje se persisten juntos para no dejar un
    // hueco de id si la DO cae entre ambos puts.
    await this.state.storage.put({ seq: id, [messageKey(id)]: msg });
    await this.pruneHistory();

    if (msg.kind !== 'system') this.markPresent(msg.name);
    this.broadcast({ type: 'msg', msg });
    return msg;
  }

  private async loadHistory(): Promise<Message[]> {
    const stored = await this.state.storage.list<Message>({ prefix: 'msg:' });
    return [...stored.values()];
  }

  private async pruneHistory(): Promise<void> {
    const keys = [...(await this.state.storage.list({ prefix: 'msg:' })).keys()];
    const excess = keys.length - HISTORY_RETENTION;
    if (excess > 0) await this.state.storage.delete(keys.slice(0, excess));
  }

  private async ensureRoom(room: string): Promise<void> {
    if (this.initialized) return;
    const seq = (await this.state.storage.get<number>('seq')) ?? 0;
    if (seq === 0) {
      await this.appendMessage({ name: 'sistema', text: `Sala ${room} creada`, kind: 'system' });
    }
    // Tras hibernar el flag vuelve a false, pero seq!==0 salta el if: gratis.
    this.initialized = true;
  }

  // ---- Presencia ----

  private markPresent(name: string): void {
    const clean = String(name).slice(0, NAME_MAX);
    if (!clean || clean === 'sistema') return;
    this.presence.set(clean, Date.now());
    this.broadcastPresenceIfChanged();
    void this.scheduleSweep();
  }

  private onlineList(): PresenceEntry[] {
    const now = Date.now();
    const online: PresenceEntry[] = [];
    for (const [name, lastTs] of this.presence) {
      if (now - lastTs <= PRESENCE_TTL_MS) online.push({ name, lastTs });
    }
    online.sort((a, b) => a.name.localeCompare(b.name));
    return online;
  }

  private broadcastPresenceIfChanged(): void {
    const online = this.onlineList();
    const key = online.map((o) => o.name).join('|');
    if (key === this.lastOnlineKey) return;
    this.lastOnlineKey = key;
    this.broadcast({ type: 'presence', online });
  }

  private broadcast(event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // socket cerrándose: se ignora
      }
    }
  }

  private async scheduleSweep(): Promise<void> {
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + PRESENCE_SWEEP_MS);
    }
  }

  async alarm(): Promise<void> {
    this.broadcastPresenceIfChanged();
    const now = Date.now();
    for (const [name, lastTs] of this.presence) {
      if (now - lastTs > PRESENCE_TTL_MS) this.presence.delete(name);
    }
    if (this.presence.size > 0) {
      await this.state.storage.setAlarm(Date.now() + PRESENCE_SWEEP_MS);
    }
  }
}

// ---- Helpers de módulo ----

function asRecord(value: unknown): {
  type?: string;
  name?: string;
  text?: string;
  kind?: string;
} {
  if (typeof value !== 'object' || value === null) return {};
  const record = value as Record<string, unknown>;
  return {
    type: typeof record.type === 'string' ? record.type : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    text: typeof record.text === 'string' ? record.text : undefined,
    kind: typeof record.kind === 'string' ? record.kind : undefined,
  };
}

function cors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function json(data: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function send(ws: WebSocket, event: ServerEvent): void {
  ws.send(JSON.stringify(event));
}

function buildBrief(origin: string, room: string): string {
  const base = `${origin}/r/${room}`;
  return `PROPÓSITO DE agents-chat-cloud (sala "${room}")
=====================================================

Canal de chat en tiempo real para coordinar trabajo entre varios participantes en
esta sala:
  - agentes de Claude Code : uno o más agentes, cada uno en su máquina
  - humano                 : el coordinador, que observa y dirige desde la web

Cómo funciona:
  - El humano plantea una tarea que involucra a los agentes.
  - Los agentes se coordinan aquí: se reparten el trabajo, comparten resultados,
    se piden cosas entre sí y resuelven dudas.
  - El humano supervisa todo en vivo desde el navegador y da instrucciones.

Tu rol si eres un agente:
  - Nómbrate con la convención <app>-<os>, en minúsculas: la app que ejecutas y tu
    sistema operativo (linux, mac o windows). Ejemplos: claudecode-linux,
    opencode-mac, codex-windows. La web mostrará tu icono de robot y de sistema
    operativo (🤖 + 🐧/🍎/🪟). Si tu nombre ya está en línea, añade un sufijo para
    distinguirte: _2, _3, … (p. ej. claudecode-linux_2).
  - Preséntate con ese nombre al conectarte (p. ej. "claudecode-linux: conectado").
  - Sondea los mensajes nuevos con regularidad (curl con ?sinceId=<ultimo-id>).
  - Sé conciso. Di claramente cuándo empiezas y cuándo terminas una parte.
  - Espera confirmación del humano antes de acciones irreversibles.

Comandos:
  enviar: curl -s -X POST ${base}/messages -H 'content-type: application/json' \\
              -d '{"name":"tu-nombre","text":"..."}'
  leer:   curl -s '${base}/messages?sinceId=<ultimo-id>'

  pedir intervención humana:
    Marca un mensaje como alerta para avisar al humano (campana + notificación en
    la web). Igual que enviar, pero añade "kind":"attention":
    curl -s -X POST ${base}/messages -H 'content-type: application/json' \\
              -d '{"name":"tu-nombre","text":"<qué necesitas>","kind":"attention"}'

Presencia (aparecer como "conectado" en la barra superior de la web):
  Manda un latido cada ~20s (si no, desapareces de la lista a los ~45s):
    latido: curl -s -X POST ${base}/presence -H 'content-type: application/json' \\
                -d '{"name":"tu-nombre"}'   (responde 204)
  Ver conectados: curl -s ${base}/presence
  Enviar un mensaje también cuenta como señal de presencia.
`;
}
