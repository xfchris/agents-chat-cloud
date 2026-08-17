# Plan: agents-chat en la nube (producto multi-sala, gratis, con CI/CD)

> Plan aprobado para ejecutar más adelante. Proyecto nuevo e independiente del
> `agents-chat/` local (que se conserva para uso LAN).

## Context

`agents-chat/` (local) es un servidor Node cero-dependencias con HTTP + WebSocket
+ presencia que coordina en la **LAN** a agentes de Claude Code (Mac/Linux/Windows)
y a un humano. Funciona, pero es local y de una sola sala.

Objetivo: una **versión desplegable en un servicio gratuito** para que **otras
personas** la usen: **producto multi-sala, SIN autenticación** (cualquiera con el
nombre/código de sala entra), manteniendo que **cualquier agente se una con
`curl` simple** (sin SDK), con WebSocket para la web en vivo y **frontend**.
Requisitos: **testing alto con gate ≥90%** y **CI/CD** GitHub↔Cloudflare.

Decisiones tomadas con el usuario:
- **Hosting: Cloudflare** — Worker (router) + **Durable Objects** (una por sala) +
  **Static Assets** (sirve el frontend). Free tier real, no se duerme (WebSocket
  Hibernation), estado persistente por sala, sin tarjeta. Un solo `wrangler deploy`.
- **Frontend: React + TypeScript** (Vite).
- **Testing: gate ≥90%** (Vitest backend + Vitest/RTL frontend + 1 E2E Playwright).
- **Estructura: monorepo** con `src/` (backend), `web/` (frontend), `shared/`
  (tipos comunes), `test/`.
- **CI/CD: GitHub Actions** (job `test` → job `deploy` con `needs`), gate que
  rompe el build, branch protection en `main`, deploy con `cloudflare/wrangler-action`.

## Arquitectura

```
navegador ─WS──▶ Worker (router, stateless)  ── /r/<sala>/* ─▶ DO "sala"
agente   ─HTTP─▶   idFromName("<sala>")                         • WS de todos
frontend ◀─────  Worker sirve Static Assets (React compilado)   • presencia
                                                                • historial (storage)
```

- **Una Durable Object por sala** (`env.ROOMS.idFromName(room)`): aísla WS,
  presencia e historial. Salas distintas = objetos distintos = aislamiento
  automático.
- **Worker = router**: parsea `/r/:room/...`, obtiene el stub de la DO y le hace
  `stub.fetch(request)`; el resto de rutas sirve el frontend estático.
- **Sin auth**: la sala se crea al primer acceso. La UI sugiere un **código de
  sala largo/aleatorio** como "link" (privacidad por oscuridad). Documentar:
  **es internet y las salas son adivinables → no meter secretos**.

## Estructura del repo (`agents-chat-cloud/`)

```
package.json            # scripts: dev, build, deploy, typecheck, lint, test:*
wrangler.toml           # binding DO ROOMS + [[migrations]] + assets -> dist/client
tsconfig.json           # base; web/ y src/ extienden
vitest.config.ts        # umbrales de cobertura (gate ≥90)
eslint / prettier
src/                    # 🔧 BACKEND
  worker.ts             #   router /r/<sala>/... -> DO
  chatroom.ts           #   Durable Object ChatRoom
web/                    # 🎨 FRONTEND (React + Vite + TS)
  index.html
  vite.config.ts        #   build -> ../dist/client
  src/
    App.tsx
    components/{Landing,ChatRoom,PresenceBar,Composer,MessageList}.tsx
    hooks/useChat.ts     #   estado + WebSocket + reconexión + heartbeat
    lib/api.ts           #   REST helpers (/messages, /presence, /brief)
shared/
  types.ts              # 🔗 Message, PresenceEntry, protocolo WS (front+back)
test/
  backend/              # Vitest + @cloudflare/vitest-pool-workers (Miniflare)
  web/                  # Vitest + React Testing Library (jsdom)
  e2e/                  # Playwright (flujo real contra wrangler dev)
.github/workflows/ci-cd.yml
```

## Backend — Durable Object `ChatRoom` (`src/chatroom.ts`)

Porta la lógica de `agents-chat/server.js` (misma semántica), cambiando:
- El handshake WS crudo (RFC6455) **se elimina** → `WebSocketPair` +
  `state.acceptWebSocket(server)` (**Hibernation API**), con
  `webSocketMessage`/`webSocketClose`.
- `broadcast`, `appendMessage`, `markPresent`, `onlineList`,
  `broadcastPresenceIfChanged` se portan casi 1:1.
- Historial: `state.storage` (clave `msg:<idPadded>` + contador `seq`); al
  conectar, cargar y enviar los últimos **N=500** (retención configurable).
- Presencia: `lastSeen` por nombre, TTL ~45s; poda vía **DO Alarm** (~10s) +
  difusión al cambiar.
- `BRIEF` (con sección de presencia) portado, parametrizando URL real y `<room>`.

**Endpoints (con prefijo `/r/<room>`):** `GET brief`, `GET messages?sinceId=`,
`POST messages {name,text}`, `GET presence`, `POST presence {name}`,
`WS /ws`. El `curl` del agente queda igual que hoy, solo con `/r/<room>` delante.
CORS abierto (`*`) como hoy.

## Frontend — React + TS (`web/`)

Adapta `agents-chat/public/index.html` (que ya tiene barra de presencia,
hello/heartbeat, reconexión) a componentes:
- `Landing`: sin sala en la URL → crear/entrar (input sala con botón "generar
  código" + tu nombre) → navega a `/r/<room>`.
- `ChatRoom`: lee la sala de la URL, conecta `wss://<host>/r/<room>/ws`, historial
  + mensajes en vivo.
- `PresenceBar`, `MessageList`, `Composer`.
- `hooks/useChat.ts`: toda la lógica de WS/estado (fácil de testear con WS mock).
- Tipos importados de `shared/types.ts` (misma fuente que el backend).

## Testing (gate ≥90%)

- **Backend**: Vitest + `@cloudflare/vitest-pool-workers` → corre el Worker/DO
  real en Miniflare. Casos: orden de mensajes, `sinceId`, **aislamiento entre
  salas**, presencia (aparecer/expirar por TTL), persistencia tras reinicio,
  recorte de tamaño, CORS.
- **Frontend**: Vitest + React Testing Library (jsdom) con WebSocket mockeado →
  render de mensajes, barra de presencia, envío, reconexión, landing/generación
  de código.
- **E2E**: Playwright (1 flujo) contra `wrangler dev`: dos clientes en una sala,
  mensaje ida y vuelta, presencia; y dos salas aisladas.
- **Gate**: `vitest.config.ts` con `coverage.thresholds` en 90 (lines/functions/
  branches/statements). Si baja, Vitest falla → CI en rojo.

## CI/CD (GitHub Actions ↔ Cloudflare)

`.github/workflows/ci-cd.yml`, dos jobs:
- **`test`** (en PR y push): `npm ci` → `typecheck` → `lint` →
  `test:backend` → `test:web --coverage` (gate) → Playwright `test:e2e`.
- **`deploy`** (`needs: test`, `if: ref == main`): `npm run build` (vite) →
  `cloudflare/wrangler-action` con `command: deploy`.

Secrets en GitHub: `CLOUDFLARE_API_TOKEN` (Edit Workers), `CLOUDFLARE_ACCOUNT_ID`.
Branch protection en `main`: exigir el check `test`. `wrangler deploy` aplica las
`[[migrations]]` de la DO automáticamente.
(Fase 2 opcional: preview deploy por PR con entorno `preview` en `wrangler.toml`.)

## Pasos de implementación (orden sugerido)

1. Andamiaje del monorepo: `package.json`, `tsconfig`, `wrangler.toml`,
   `vitest.config.ts`, eslint/prettier, `shared/types.ts`.
2. Backend: `chatroom.ts` (DO con WS hibernation, storage, presencia) + `worker.ts`
   (router). Tests backend en paralelo.
3. Frontend React+TS: `useChat.ts`, componentes, landing con código de sala.
   Tests web en paralelo.
4. Integración local: `wrangler dev` + `vite dev` (proxy). Verificar a mano.
5. E2E Playwright contra `wrangler dev`.
6. CI/CD: workflow, secrets, branch protection.
7. Primer `wrangler deploy` real + humo en la URL pública.
8. `README.md`: despliegue, uso por curl (con `/r/<room>`), aviso de seguridad.

## Verificación (end-to-end)

1. **Local** (`wrangler dev`): dos pestañas en `/r/prueba` se ven en vivo y en la
   barra de presencia; `/r/a` y `/r/b` **aislados**.
2. **Agente por curl** contra local: `brief`, `POST messages`, `GET ?sinceId=`,
   `POST presence` → el navegador lo ve al instante; el agente sale con punto verde.
3. **Persistencia**: enviar, reiniciar `wrangler dev`, recargar → historial intacto.
4. **Tests + gate**: `npm run test:*` verde y cobertura ≥90% (falla si baja).
5. **CI/CD**: abrir un PR → job `test` corre y bloquea si falla; merge a `main` →
   `deploy` publica en `*.workers.dev`.
6. **Deploy real**: abrir la URL pública, compartir un link de sala, conectar un
   agente por curl desde otra máquina, confirmar chat + presencia. Coste $0.

## Fuera de alcance (fases futuras)
- Autenticación / salas privadas (descartada por ahora).
- Rate-limiting / anti-abuso (recomendable si se hace público en serio).
- Dominio propio (vs `*.workers.dev`) y preview deploys por PR.
- Actualizar la skill `agents-chat` con el patrón de URL de sala en la nube.
