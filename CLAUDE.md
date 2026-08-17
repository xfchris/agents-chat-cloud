# CLAUDE.md — Guía del proyecto para Claude Code

Instrucciones para trabajar en este repo. Léelas antes de tocar código.

## Qué es

`agents-chat-cloud` es un chat multi-sala en tiempo real para coordinar agentes de
Claude Code (Mac/Linux/Windows) y a un humano, **desplegable gratis en Cloudflare**.
Los agentes se unen con `curl` simple (sin SDK); la web usa WebSocket en vivo. Es la
versión en la nube del proyecto LAN `../agents-chat/` (Node cero-dependencias), que se
conserva aparte como referencia funcional.

## Arquitectura

```
navegador ─WS──▶ Worker (router, stateless)  ── /r/<sala>/* ─▶ Durable Object "sala"
agente   ─HTTP─▶   env.ROOMS.idFromName("<sala>")               • WS de todos
frontend ◀─────  Worker sirve Static Assets (React compilado)   • presencia + historial
```

- **Una Durable Object por sala** (`ChatRoom`): aísla WebSocket, presencia e
  historial. Salas distintas = objetos distintos = aislamiento automático.
- **Worker = router**: parsea `/r/:room/...`, obtiene el stub de la DO y le delega
  `stub.fetch()`. El resto de rutas las sirve Static Assets (el frontend).
- **Sin autenticación**: la sala se crea al primer acceso. El código de sala largo y
  aleatorio es "privacidad por oscuridad" — es internet y las salas son adivinables,
  **no meter secretos**.

## Estructura del monorepo

```
src/            # Backend: worker.ts (router) + chatroom.ts (Durable Object)
web/            # Frontend: React + Vite + TS
shared/         # Fuente ÚNICA de tipos (types.ts) y constantes (constants.ts)
test/           # backend/ (Miniflare), web/ (RTL+jsdom), e2e/ (Playwright)
docs/specs/     # Specs (spec-driven). 00 = mapa de capacidades; NN-<módulo> = specs
wrangler.toml   # binding DO ROOMS + [[migrations]] + [assets] -> dist/client (SPA)
```

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run typecheck` | `tsc` sobre raíz (`shared`+`src`) y `web/`. Debe pasar siempre. |
| `npm run lint` | ESLint 10 flat config (TS/React). |
| `npm run test:backend` | Vitest + pool-workers (Miniflare). |
| `npm run test:web` | Vitest + React Testing Library (jsdom). |
| `npm run test:e2e` | Playwright contra `wrangler dev`. |
| `npm run build` | Vite → `dist/client`. |
| `npm run dev` | Desarrollo local. |
| `npm run deploy` | `wrangler deploy` (aplica migraciones de la DO). |

`build`, `deploy` y `wrangler deploy --dry-run` fallan hasta que existan el Worker
(SPEC 02) y el frontend (SPEC 03). Es esperado.

## Convenciones (obligatorias)

- **Commits: Conventional Commits** — `tipo(scope): descripción` (en español). Ej.:
  `feat(backend): ...`, `feat(web): ...`, `docs(specs): ...`, `ci(deploy): ...`.
- **Spec-driven**: todo módulo nace de una spec en `docs/specs/`. No implementes sin
  spec aprobada. El índice de specs es `docs/specs/00-mapa-de-capacidades.md`.
- **Ramas por spec**: `feature/NN-<descripción>` (skill `/rama-spec`).
- **`shared/` es la única fuente de tipos**: backend y frontend importan de ahí; no
  redefinas `Message`/`PresenceEntry`/protocolo WS en otro sitio.
- **Cobertura ≥90%** (gate en CI, medido por proyecto). No bajarla.
- **Este es un Worker + Durable Object, sin DB**: no montes capas de
  services/repositories. Sigue la estructura de las specs (`worker.ts`, `chatroom.ts`).
- No commitear/pushear salvo que el usuario lo pida.

## Decisiones clave (ver specs para el detalle)

- Historial: poda a los últimos **500** mensajes por sala (borra los más viejos).
- `GET /r/:room/messages` solo acepta `?sinceId=<n>` (no `?since=<ISO>`).
- Nombre de sala: `^[a-z0-9-]{3,64}$`; inválido → 404.
- Código de sala generado: base32 aleatorio ~12 chars (`crypto.getRandomValues`).
- Al primer acceso a una sala se emite un mensaje `kind:'system'`: `Sala <room> creada`.
- Presencia: TTL 45s; poda por DO Alarm (~10s); heartbeat web cada 15s.

## Flujo de trabajo

1. Spec aprobada en `docs/specs/NN-<módulo>.md`.
2. Rama `feature/NN-...` (`/rama-spec NN`).
3. Harness: feature-developer → code-reviewer → test-engineer.
4. Commit en Conventional Commits; el humano decide merge.
