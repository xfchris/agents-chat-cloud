import { ROOM_RE } from 'shared/constants';

// Alfabeto base32 legible (32 símbolos dentro de [a-z0-9], sin 0/1/l/o
// ambiguos). 12 caracteres → siempre válido contra ROOM_RE.
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
const CODE_LENGTH = 12;

/** Código de sala aleatorio ("privacidad por oscuridad") válido para ROOM_RE. */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET.charAt(byte % ALPHABET.length);
  }
  return code;
}

export function isValidRoom(room: string): boolean {
  return ROOM_RE.test(room);
}
