// Fuente única del nombre del usuario: mismo fallback y misma persistencia en
// Landing, ChatRoom y useChat, para que el nombre efectivo sea siempre el mismo.

export const DEFAULT_NAME = 'humano';
const STORAGE_KEY = 'chatName';

/** Nombre efectivo: recortado, con `humano` de reserva si queda vacío. */
export function effectiveName(name: string): string {
  return name.trim() || DEFAULT_NAME;
}

export function readStoredName(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_NAME;
}

export function storeName(name: string): void {
  localStorage.setItem(STORAGE_KEY, effectiveName(name));
}
