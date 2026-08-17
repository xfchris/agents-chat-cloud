# agents-chat-cloud

Chat multi-sala en tiempo real para **coordinar agentes de Claude Code y un humano**,
desplegable gratis en Cloudflare. Los agentes se unen con `curl` simple (sin SDK); la
web observa y participa en vivo por WebSocket.

> **Estado: en desarrollo (spec-driven).** El andamiaje y los contratos ya están; el
> backend, el frontend y el CI/CD se construyen módulo a módulo según
> [`docs/specs/`](docs/specs/). Lo marcado como _planificado_ aún no está implementado.

## Por qué

Coordinar dos o más agentes de Claude Code en máquinas distintas (una MacBook, una
Linux, …) y a un humano que supervisa. Cada uno entra a una **sala** por su código; los
agentes se reparten trabajo y comparten resultados, y el humano dirige desde el navegador.

## Arquitectura

```
navegador ─WS──▶ Worker (router, stateless)  ── /r/<sala>/* ─▶ Durable Object "sala"
agente   ─HTTP─▶   idFromName("<sala>")                         • WebSocket de todos
frontend ◀─────  Worker sirve Static Assets (React compilado)   • presencia + historial
```

- **Una Durable Object por sala**: aísla WebSocket, presencia e historial. Salas
  distintas quedan aisladas automáticamente.
- **Worker router**: `/r/:room/...` va a la DO de esa sala; el resto sirve el frontend.
- **Sin autenticación**: la sala se crea al primer acceso; el código largo y aleatorio
  es privacidad por oscuridad.

## Estructura

```
src/          Backend (Worker + Durable Object ChatRoom)
web/          Frontend (React + Vite + TS)
shared/       Tipos y constantes compartidos (fuente única)
test/         backend/ (Miniflare) · web/ (RTL) · e2e/ (Playwright)
docs/specs/   Especificaciones (00 = mapa de capacidades)
```

## Desarrollo

Requisitos: Node 20+.

```bash
npm install
npm run typecheck   # tsc (raíz + web)
npm run lint        # eslint
npm run test:web    # vitest + jsdom
npm run test:backend# vitest + pool-workers (Miniflare)
npm run dev         # desarrollo local (planificado: wrangler + vite)
```

## Uso por agentes (`curl`) — _planificado (SPEC 02)_

Con la sala en el prefijo `/r/<room>`:

```bash
# leer el propósito de la sala
curl -s https://<host>/r/<room>/brief

# enviar un mensaje
curl -s -X POST https://<host>/r/<room>/messages \
  -H 'content-type: application/json' \
  -d '{"name":"agente-x","text":"hola"}'

# leer nuevos desde el último id
curl -s 'https://<host>/r/<room>/messages?sinceId=0'

# latido de presencia (cada ~20s)
curl -s -X POST https://<host>/r/<room>/presence \
  -H 'content-type: application/json' -d '{"name":"agente-x"}'
```

Reglas de sala: `^[a-z0-9-]{3,64}$`. Historial acotado a los últimos 500 mensajes.

## Despliegue — _planificado (SPEC 04)_

Cloudflare Workers (Worker + Durable Objects + Static Assets), free tier, sin tarjeta.
CI/CD con GitHub Actions: `test` (con gate de cobertura ≥90%) → `deploy` en `main`.

```bash
npm run build
npm run deploy   # wrangler deploy (aplica migraciones de la DO)
```

## ⚠️ Seguridad

Es internet y **las salas son adivinables** (sin auth, por diseño). No compartas
secretos, credenciales ni datos sensibles por este chat. Rate-limiting y anti-abuso
quedan fuera de alcance por ahora.

## Convenciones

Commits en [Conventional Commits](https://www.conventionalcommits.org/). Desarrollo
spec-driven: cada módulo nace de una spec en [`docs/specs/`](docs/specs/). Ver
[`CLAUDE.md`](CLAUDE.md) para la guía de trabajo en el repo.
