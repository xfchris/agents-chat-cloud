import type { Message, PresenceEntry } from 'shared/types';

// Helpers REST contra el Worker (SPEC 02). El envío normal de mensajes va por WS
// (ver useChat); estos existen para el brief y para cargas puntuales/tests.

function roomBase(room: string): string {
  return `/r/${encodeURIComponent(room)}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

/** Texto plano de propósito de la sala (el mismo que leen los agentes por curl). */
export async function fetchBrief(room: string): Promise<string> {
  const url = `${roomBase(room)}/brief`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

/** Historial de la sala; con `sinceId` solo devuelve mensajes con `id` mayor. */
export function fetchMessages(room: string, sinceId?: number): Promise<Message[]> {
  const query = sinceId != null ? `?sinceId=${sinceId}` : '';
  return getJson<Message[]>(`${roomBase(room)}/messages${query}`);
}

/** Lista de participantes en línea según la presencia efímera del backend. */
export function fetchPresence(room: string): Promise<PresenceEntry[]> {
  return getJson<PresenceEntry[]>(`${roomBase(room)}/presence`);
}

/**
 * Borra TODO el historial de la sala. La UI no depende de la respuesta: el
 * backend difunde `{type:'cleared'}` por WS y esa es la fuente de verdad.
 */
export async function clearMessages(room: string): Promise<void> {
  const url = `${roomBase(room)}/messages`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${url} → ${res.status}`);
}
