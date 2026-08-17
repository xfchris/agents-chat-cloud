# SPEC 01 — Andamiaje del monorepo y contratos compartidos

> **Estado:** Borrador
> **Depende de:** —
> **Fecha:** 2026-08-17
> **Objetivo:** Dejar el monorepo configurado (build, typecheck, lint, test, deploy) y con los tipos compartidos que backend y frontend importarán.

## Por qué existe esta spec

Backend y frontend comparten el protocolo WebSocket y las formas `Message` /
`PresenceEntry`. Si cada uno define lo suyo, divergen. Esta spec fija **una sola
fuente de tipos** (`shared/types.ts`) y toda la configuración de herramientas para
que las specs 02–04 no repitan andamiaje ni tomen decisiones de tooling.

## Alcance

**Dentro:**

- `package.json` raíz con scripts: `dev`, `build`, `deploy`, `typecheck`, `lint`,
  `test:backend`, `test:web`, `test:e2e`.
- `tsconfig.json` base; `web/tsconfig.json` y config de `src/` extienden de él.
- `wrangler.toml`: binding de Durable Object `ROOMS`, `[[migrations]]`, y
  `[assets]` sirviendo `dist/client` con fallback SPA.
- `vitest.config.ts` con umbrales de cobertura al 90 (lines/functions/branches/
  statements). El detalle del gate lo consume `04-cicd`.
- ESLint + Prettier (config mínima consistente TS/React).
- `shared/types.ts`: `Message`, `PresenceEntry`, y los tipos del protocolo WS
  (mensajes cliente→servidor y servidor→cliente).
- Estructura de carpetas vacía: `src/`, `web/src/`, `test/{backend,web,e2e}/`.

**Fuera de alcance (para futuras specs):**

- Implementación del Worker/DO (va en `02-backend`).
- Componentes React y `useChat` (van en `03-frontend`).
- Workflow de GitHub Actions y branch protection (van en `04-cicd`).

## Modelo de datos

Contenido de `shared/types.ts` (fuente única para back y front):

```ts
export type MessageKind = 'msg' | 'system';

export interface Message {
  id: number;        // secuencial por sala, empieza en 1
  ts: string;        // ISO-8601
  name: string;      // ≤ 80 chars
  text: string;      // ≤ 20000 chars
  kind: MessageKind; // 'msg' | 'system'
}

export interface PresenceEntry {
  name: string;
  lastTs: number;    // epoch ms de la última señal
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
```

Constantes compartidas (mismo fichero o `shared/constants.ts`):

```ts
export const NAME_MAX = 80;
export const TEXT_MAX = 20000;
export const PRESENCE_TTL_MS = 45000;
export const HISTORY_RETENTION = 500;
export const ROOM_RE = /^[a-z0-9-]{3,64}$/;
```

Convenciones:

- El `id` es por sala (cada Durable Object lleva su propio contador `seq`).
- `kind:'system'` no cuenta para presencia.

## Interfaces / API

Esta spec **no expone endpoints ni componentes**. Solo publica tipos y config. El
contrato de red concreto lo define `02-backend`.

## Plan de implementación

1. Crear `package.json` raíz con `type: "module"`, devDependencies (typescript,
   wrangler, vitest, `@cloudflare/vitest-pool-workers`, eslint, prettier) y los
   scripts listados en Alcance (apuntando a comandos que existirán en specs 02–04;
   pueden fallar hasta entonces).
2. Crear `tsconfig.json` base (target/lib modernos, `strict: true`, paths a
   `shared/*`). Verificación: `npm run typecheck` no da errores de config.
3. Crear `shared/types.ts` y `shared/constants.ts` con el contenido de arriba.
   Verificación: `npm run typecheck` pasa.
4. Crear `wrangler.toml`: `name`, `main = "src/worker.ts"`, `compatibility_date`,
   binding `[[durable_objects.bindings]]` `ROOMS` → clase `ChatRoom`,
   `[[migrations]]` con `new_sqlite_classes`/`new_classes = ["ChatRoom"]`, y
   `[assets]` `directory = "dist/client"` con `not_found_handling =
   "single-page-application"`. Verificación: `npx wrangler deploy --dry-run` valida
   la config (aún sin `ChatRoom` real, se documenta que fallará hasta `02-backend`).
5. Crear `vitest.config.ts` con `coverage.thresholds` = 90 en las 4 métricas y
   proyectos separados para backend (pool workers) y web (jsdom).
6. Crear `.eslintrc`/`eslint.config.js` y `.prettierrc` mínimos.
7. Crear las carpetas vacías `src/`, `web/src/`, `test/{backend,web,e2e}/` con un
   `.gitkeep` cada una.

## Criterios de aceptación

- [ ] `npm run typecheck` pasa con `shared/types.ts` y `shared/constants.ts`.
- [ ] `shared/types.ts` exporta `Message`, `PresenceEntry`, `ServerEvent`,
      `ClientEvent` exactamente con la forma de esta spec.
- [ ] `shared/constants.ts` exporta `PRESENCE_TTL_MS=45000`, `HISTORY_RETENTION=500`,
      `NAME_MAX=80`, `TEXT_MAX=20000` y `ROOM_RE`.
- [ ] `wrangler.toml` declara el binding `ROOMS`, una `[[migrations]]` para
      `ChatRoom` y `[assets]` con fallback SPA a `dist/client`.
- [ ] `vitest.config.ts` fija los 4 umbrales de cobertura en 90.
- [ ] `package.json` expone los 8 scripts (`dev`, `build`, `deploy`, `typecheck`,
      `lint`, `test:backend`, `test:web`, `test:e2e`).
- [ ] Existen `src/`, `web/src/`, `test/{backend,web,e2e}/`.

## Decisiones

- **Sí:** `shared/` como fuente única de tipos, importada por `src/` y `web/` vía
  paths de TS. Evita divergencia del protocolo entre back y front.
- **Sí:** monorepo con un solo `package.json` raíz. El proyecto es pequeño; un
  workspace multi-paquete sería sobreingeniería.
- **Sí:** `not_found_handling = "single-page-application"` en assets, porque el
  frontend usa rutas de cliente (`/r/:room`) que deben caer en `index.html`.
- **No:** definir aquí los umbrales por-métrica distintos. Todos a 90, uniforme; si
  hiciera falta afinar, se hace en `04-cicd`.
- **No:** ESLint con reglas estrictas de estilo. Config mínima; el foco es corrección
  de tipos, no bikeshedding.

## Casos borde

- `npm run test:*` antes de existir código de back/front → los tests aún no existen;
  los scripts deben existir aunque no haya suites que correr todavía.
- `wrangler deploy --dry-run` antes de `02-backend` → fallará porque falta la clase
  `ChatRoom`. Es esperado; se resuelve al implementar el backend.

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Lógica del Worker, la Durable Object o los componentes React.
- El workflow de CI/CD y los secrets.

Cada uno va en su propia spec (`02-backend`, `03-frontend`, `04-cicd`).
