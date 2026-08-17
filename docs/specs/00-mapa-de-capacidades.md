# Mapa de capacidades: agents-chat en la nube

> **Estado:** Aprobado
> **Fecha:** 2026-08-17
> **Origen:** `PLAN.md` (plan aprobado) + código a portar en `../agents-chat/`.

Producto multi-sala, sin autenticación, desplegable en Cloudflare (Worker + Durable
Objects + Static Assets). Cualquier agente se une con `curl` simple; la web usa
WebSocket en vivo. Gate de testing ≥90% y CI/CD GitHub↔Cloudflare.

Esta iniciativa se descompone en 4 módulos porque toca dominios con consumidores y
criterios de aceptación distintos, que se lanzan y verifican por separado.

## Módulos

| id módulo    | Responsabilidad                                                                                                       | Depende de           |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `andamiaje`  | Monorepo: `package.json`, `tsconfig`, `wrangler.toml`, `vitest.config.ts`, eslint/prettier + `shared/types.ts` (contratos WS, `Message`, `PresenceEntry`) | —                    |
| `backend`    | Worker router `/r/:room/*` + Durable Object `ChatRoom` (WS Hibernation, storage, presencia, brief) + tests backend (Miniflare) | `andamiaje`          |
| `frontend`   | App React+Vite+TS (Landing, ChatRoom, PresenceBar, MessageList, Composer, `useChat`) + tests web (RTL)                 | `andamiaje`          |
| `cicd`       | Gate cobertura ≥90, E2E Playwright, GitHub Actions (`test`→`deploy`), deploy Cloudflare, branch protection             | `backend`, `frontend`|

**Orden de construcción:** `andamiaje` → `backend`, `frontend` → `cicd`

## Ficheros de spec

- `01-andamiaje.md` — id `andamiaje`
- `02-backend.md` — id `backend`
- `03-frontend.md` — id `frontend`
- `04-cicd.md` — id `cicd`

## Reglas del mapa

- **Ids estables** en kebab-case; no se renombran a mitad de iniciativa.
- **Dependencias sin ciclos.** `contratos` viven en la frontera: `shared/types.ts`
  (en `andamiaje`) es la única fuente de tipos que backend y frontend importan.
- El contrato WS/HTTP concreto vive en la spec del **proveedor** (`backend`); el
  `frontend` lo consume.

## Decisiones de alcance (comunes a todas las specs)

- **Retención de historial:** podar a los últimos **500** mensajes (borrar los más
  viejos de `state.storage`). No se guarda historial ilimitado.
- **`GET messages`:** solo filtro `?sinceId=<n>`. Se descarta el `?since=<ISO>` del
  server local.
- **Nombre de sala:** normalizado a `^[a-z0-9-]{3,64}$`. Nombres inválidos → 404.
- **Código de sala generado:** aleatorio base32 de ~12 caracteres
  (`crypto.getRandomValues`), dentro del alfabeto `[a-z0-9]`.
- **Mensaje de sistema:** al primer acceso a una sala se emite un mensaje
  `kind:'system'` con texto `Sala <room> creada`.
- **Routing frontend:** `react-router-dom`.

## Fuera de alcance (fases futuras)

- Autenticación / salas privadas.
- Rate-limiting / anti-abuso.
- Dominio propio (vs `*.workers.dev`) y preview deploys por PR.
- Actualizar la skill `agents-chat` con el patrón de URL de sala.
