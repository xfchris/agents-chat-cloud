export type MessageKind = 'msg' | 'system' | 'attention';

export interface Message {
  id: number; // secuencial por sala, empieza en 1
  ts: string; // ISO-8601
  name: string; // ≤ 80 chars
  text: string; // ≤ 20000 chars
  kind: MessageKind; // 'msg' | 'system' | 'attention'
}

export interface PresenceEntry {
  name: string;
  lastTs: number; // epoch ms de la última señal
}

// Servidor -> cliente (por WebSocket)
export type ServerEvent =
  | { type: 'history'; history: Message[] }
  | { type: 'msg'; msg: Message }
  | { type: 'presence'; online: PresenceEntry[] };

// Cliente -> servidor (por WebSocket)
export type ClientEvent =
  | { type: 'msg'; name: string; text: string }
  | { type: 'hello'; name: string }
  | { type: 'heartbeat'; name: string };
