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

// ---------- Identidad visual del participante ----------
// La identidad viaja en el `name` (el protocolo no se extiende): un agente se nombra
// `<app>-<os>` con sufijo opcional `_<n>`, y aquí lo parseamos para pintar iconos.

export type AgentOs = 'linux' | 'mac' | 'windows';

export interface Identity {
  kind: 'agent' | 'human';
  label: string; // texto a mostrar: app (+ `_sufijo`), o el nombre tal cual
  robot: boolean; // true → 🤖
  os?: AgentOs; // el render pinta el logo del SO (ver OsIcon)
  app?: string; // 'claudecode', 'opencode', 'codex', …
  suffix?: string; // '2', '3', … si venía `_n`
}

// La regex reconoce los alias de SO; el switch los normaliza a `AgentOs`.
const AGENT_NAME_RE = /^([a-z0-9]+)-(linux|mac|macos|darwin|windows|win)(?:_(\d+))?$/;

const HUMAN_ICON = '👤';
const ROBOT_ICON = '🤖';

/** Normaliza el alias de SO (ya validado por la regex) a su `AgentOs`. */
function osFromAlias(alias: string): AgentOs {
  switch (alias) {
    case 'mac':
    case 'macos':
    case 'darwin':
      return 'mac';
    case 'windows':
    case 'win':
      return 'windows';
    default:
      return 'linux';
  }
}

/**
 * Deriva la identidad visual de un nombre. Puro, sin efectos.
 * Casa `<app>-<os>[_n]` → agente (🤖 + logo de SO); si no, humano (👤 + nombre tal cual).
 */
export function parseIdentity(name: string): Identity {
  const match = AGENT_NAME_RE.exec(name);
  if (!match) {
    return { kind: 'human', label: name, robot: false };
  }

  const [, app = '', rawOs = '', suffix] = match;
  const os = osFromAlias(rawOs);
  const label = suffix ? `${app}_${suffix}` : app;

  return {
    kind: 'agent',
    label,
    robot: true,
    os,
    app,
    ...(suffix ? { suffix } : {}),
  };
}

/** Icono de prefijo de una identidad: 🤖 para agentes, 👤 para humanos. */
export function kindIcon(identity: Identity): string {
  return identity.robot ? ROBOT_ICON : HUMAN_ICON;
}
