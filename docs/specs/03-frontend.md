# SPEC 03 — Frontend React + TypeScript (`web/`)

> **Estado:** Borrador
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-08-17
> **Objetivo:** Adaptar la UI de `agents-chat/public/index.html` a componentes React+TS multi-sala, con landing, WebSocket en vivo, presencia y reconexión.

## Por qué existe esta spec

La UI actual (`../agents-chat/public/index.html`, 252 líneas) es una sola página de
una sola sala. El producto en la nube necesita: (1) una **Landing** para crear/entrar
a una sala, (2) una vista **ChatRoom** parametrizada por `/r/:room`, y (3) toda la
lógica de WS/estado aislada en un hook testeable con un WebSocket mock. Los tipos
salen de `shared/types.ts` (SPEC 01); el contrato de red, de SPEC 02.

## Alcance

**Dentro:**

- `web/index.html`, `web/vite.config.ts` (build → `../dist/client`), `web/tsconfig.json`.
- `web/src/App.tsx`: rutas con `react-router-dom` (`/` → Landing, `/r/:room` →
  ChatRoom).
- Componentes en `web/src/components/`: `Landing`, `ChatRoom`, `PresenceBar`,
  `MessageList`, `Composer`.
- `web/src/hooks/useChat.ts`: WebSocket, estado (historial + presencia), reconexión,
  heartbeat.
- `web/src/lib/api.ts`: helpers REST (`brief`, `messages`, `presence`).
- Tests en `test/web/` con Vitest + React Testing Library (jsdom) y WebSocket mock.

**Fuera de alcance (para futuras specs):**

- Implementación del backend (`02-backend`, ya hecha).
- Gate de cobertura y E2E Playwright (`04-cicd`).
- Autenticación / salas privadas.

## Modelo de datos

Reutiliza `Message`, `PresenceEntry`, `ServerEvent`, `ClientEvent` de
`shared/types.ts`. Estado local del hook `useChat`:

```ts
interface ChatState {
  messages: Message[];       // dedup por id
  online: PresenceEntry[];
  status: 'connecting' | 'connected' | 'disconnected';
}
```

Persistencia de cliente:

- `localStorage['chatName']` — nombre del usuario (por defecto `humano`), igual que
  el local.
- No hay más persistencia de cliente; el historial vive en el backend.

## Interfaces / API

**Consume** el backend de SPEC 02 (no expone API propia):

- WS: `wss://<host>/r/<room>/ws` (o `ws://` en local). Recibe `ServerEvent`, envía
  `ClientEvent`.
- REST (helpers en `lib/api.ts`): `GET /r/<room>/brief`,
  `GET /r/<room>/messages?sinceId=`, `GET /r/<room>/presence`. (El envío normal va por
  WS; los helpers REST existen para el brief y para cargas puntuales.)

**Componentes (props principales):**

- `Landing` — input de sala + botón "generar código" + input de nombre → navega a
  `/r/<room>`.
- `ChatRoom` — lee `room` de la URL (`useParams`), usa `useChat(room)`.
- `PresenceBar({ online, myName })`, `MessageList({ messages, myName })`,
  `Composer({ onSend, disabled })`.
- `useChat(room)` → `{ messages, online, status, sendMessage, sendPresence }`.

**Generación de código de sala:** base32 (`[a-z0-9]`) de ~12 chars vía
`crypto.getRandomValues`, resultado válido contra `ROOM_RE`.

## Plan de implementación

1. `web/vite.config.ts` (build a `../dist/client`, proxy `/r` → `wrangler dev` en
   dev), `web/index.html`, `web/tsconfig.json`. Verificación: `vite build` produce
   `dist/client`.
2. `web/src/lib/api.ts`: helpers `fetchBrief(room)`, `fetchMessages(room, sinceId)`,
   `fetchPresence(room)`. Verificación: test con `fetch` mock.
3. `web/src/hooks/useChat.ts`: abre WS, procesa `history`/`msg`/`presence`, dedup por
   `id`, `sendMessage`, `sendPresence('hello'|'heartbeat')`, heartbeat cada 15s,
   reconexión con backoff (~1.5s) y `status`. Verificación: tests con WS mock.
4. `web/src/components/MessageList.tsx` + `Composer.tsx` + `PresenceBar.tsx`
   (portando estilos del `index.html` local). Verificación: tests de render.
5. `web/src/components/ChatRoom.tsx`: compone `useChat(room)` + los tres componentes;
   estado de conexión visible. Verificación: test de render con router.
6. `web/src/components/Landing.tsx`: input sala + botón generar (base32) + nombre →
   `navigate('/r/'+room)`. Valida `ROOM_RE` antes de navegar. Verificación: test de
   generación y navegación.
7. `web/src/App.tsx`: `react-router-dom` con `/` y `/r/:room`. Verificación: test de
   que `/r/x-abc` monta `ChatRoom`.

## Criterios de aceptación

- [ ] En `/`, la Landing muestra input de sala, botón "generar código" e input de
      nombre.
- [ ] Pulsar "generar código" rellena el input con una cadena que cumple `ROOM_RE`.
- [ ] Entrar a una sala navega a `/r/<room>` y monta `ChatRoom`.
- [ ] Al montar `ChatRoom`, `useChat` abre el WS a `/r/<room>/ws` y, al recibir
      `{type:'history'}`, `MessageList` renderiza esos mensajes.
- [ ] Un `{type:'msg',msg}` entrante añade el mensaje a la lista sin duplicar si su
      `id` ya estaba (dedup por `id`).
- [ ] `{type:'presence',online}` actualiza `PresenceBar`; el chip propio se marca como
      "(tú)".
- [ ] Escribir en el `Composer` y enviar manda `{type:'msg',name,text}` por WS y
      limpia el input; Enter envía, Shift+Enter hace salto de línea.
- [ ] Al cerrarse el WS, `status` pasa a `disconnected` y el hook reintenta conectar.
- [ ] El nombre se lee/escribe en `localStorage['chatName']` (defecto `humano`).
- [ ] Los mensajes `kind:'system'` se renderizan con estilo de sistema (centrado,
      sin burbuja).

## Decisiones

- **Sí:** `react-router-dom` para `/` y `/r/:room`. Testeable con `MemoryRouter`,
  maneja rutas de cliente limpiamente.
- **Sí:** toda la lógica de WS/estado en `useChat`, para poder testear con un
  WebSocket mock sin montar la app entera.
- **Sí:** presencia del humano por WS (`hello`/`heartbeat`), igual que el local; los
  agentes usan `POST presence`. Dos caminos, un solo estado en el backend.
- **Sí:** dedup de mensajes por `id` en el cliente (el local ya lo hacía con un `Set`
  `seen`). Evita duplicados entre `history` y `msg`.
- **No:** gestor de estado global (Redux/Zustand). El estado vive en `useChat`; la app
  es pequeña.
- **No:** enviar mensajes por REST desde la web. La web usa WS; REST es para agentes
  y para el brief.

## Casos borde

- Sala en la URL que no cumple `ROOM_RE` → el backend responde 404 al WS/REST;
  `ChatRoom` muestra estado de error/desconectado (no crashea).
- WS cae y reconecta → al reconectar se recibe `history` de nuevo; el dedup por `id`
  evita duplicar mensajes ya mostrados.
- Nombre vacío → se usa `humano` como fallback (paridad con el local).
- Scroll: si el usuario está leyendo arriba, un mensaje nuevo no fuerza el scroll al
  fondo (se auto-scrollea solo si ya estaba abajo), igual que el local.
- Landing con sala inválida (mayúsculas, <3 chars) → no navega; feedback al usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| WebSocket mock que no refleja bien el ciclo real | El mock cubre open/message/close/reconexión; el flujo real lo valida el E2E de `04-cicd`. |
| Divergencia de tipos front/back | Ambos importan de `shared/types.ts`; `typecheck` rompe si divergen. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Backend / Durable Object (`02-backend`).
- Gate de cobertura ≥90, E2E Playwright y CI/CD (`04-cicd`).
- Autenticación y salas privadas.
