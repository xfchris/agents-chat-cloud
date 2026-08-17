import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEvent, Message, PresenceEntry, ServerEvent } from 'shared/types';
import { effectiveName } from '../lib/identity';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface Chat {
  messages: Message[];
  online: PresenceEntry[];
  status: ConnectionStatus;
  myName: string;
  sendMessage: (text: string) => void;
  sendPresence: (kind: 'hello' | 'heartbeat') => void;
}

const HEARTBEAT_MS = 15000;
const RECONNECT_MIN_MS = 1500;
const RECONNECT_MAX_MS = 15000;
const NAME_ANNOUNCE_DEBOUNCE_MS = 500;
// El backend poda a 500; mantenemos margen en cliente y cortamos por arriba.
const MESSAGE_CAP = 1000;

function wsUrl(room: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/r/${encodeURIComponent(room)}/ws`;
}

// Jitter sobre el backoff (±30%) para que varias pestañas no reintenten a la vez.
function withJitter(ms: number): number {
  return ms + Math.random() * ms * 0.3;
}

/**
 * Aísla el WebSocket de una sala: historial + presencia en estado, dedup de
 * mensajes por `id`, heartbeat periódico y reconexión con backoff exponencial.
 * `name` alimenta presencia y envío; cambiarlo reanuncia (con debounce) sin
 * reconectar. Expone `myName` (nombre efectivo) como fuente única para marcar
 * mensajes y presencia propios.
 */
export function useChat(room: string, name: string): Chat {
  const myName = effectiveName(name);

  const [messages, setMessages] = useState<Message[]>([]);
  const [online, setOnline] = useState<PresenceEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const seenRef = useRef<Set<number>>(new Set());
  const reconnectDelayRef = useRef(RECONNECT_MIN_MS);

  // Nombre por referencia: los callbacks (heartbeat, envío) leen siempre el vigente
  // sin recrear la conexión cuando cambia.
  const nameRef = useRef(myName);
  useEffect(() => {
    nameRef.current = myName;
  }, [myName]);

  const send = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  const sendPresence = useCallback(
    (kind: 'hello' | 'heartbeat') => {
      send({ type: kind, name: nameRef.current });
    },
    [send],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body) return;
      send({ type: 'msg', name: nameRef.current, text: body });
    },
    [send],
  );

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const ingest = (msg: Message) => {
      if (seenRef.current.has(msg.id)) return;
      seenRef.current.add(msg.id);
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length <= MESSAGE_CAP) return next;
        // Corta los más viejos y realinea `seen` para que no crezca sin cota.
        const trimmed = next.slice(next.length - MESSAGE_CAP);
        seenRef.current = new Set(trimmed.map((m) => m.id));
        return trimmed;
      });
    };

    const handleEvent = (raw: string) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(raw) as ServerEvent;
      } catch {
        return;
      }
      if (event.type === 'history') event.history.forEach(ingest);
      else if (event.type === 'msg') ingest(event.msg);
      else if (event.type === 'presence') setOnline(event.online);
    };

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(wsUrl(room));
      wsRef.current = ws;

      // Cada handler ignora eventos de un socket ya reemplazado, para que el
      // `onclose` de uno viejo no pise el `status` del nuevo.
      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setStatus('connected');
        reconnectDelayRef.current = RECONNECT_MIN_MS;
        sendPresence('hello');
      };
      ws.onmessage = (ev: MessageEvent<string>) => {
        if (wsRef.current !== ws) return;
        handleEvent(ev.data);
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setStatus('disconnected');
        if (disposed) return;
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
        reconnectTimer = setTimeout(connect, withJitter(delay));
      };
      ws.onerror = () => ws.close();
    };

    connect();
    const heartbeat = setInterval(() => sendPresence('heartbeat'), HEARTBEAT_MS);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeat);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [room, sendPresence]);

  // Reanuncio con debounce: al teclear el nombre solo mandamos un `hello` con el
  // valor final, no uno por letra (dejaría participantes fantasma 45s por TTL).
  const initialAnnounceRef = useRef(true);
  useEffect(() => {
    if (initialAnnounceRef.current) {
      initialAnnounceRef.current = false;
      return; // el primer `hello` lo emite `onopen`
    }
    const timer = setTimeout(() => sendPresence('hello'), NAME_ANNOUNCE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [myName, sendPresence]);

  return { messages, online, status, myName, sendMessage, sendPresence };
}
