# SPEC 04 — Gate de cobertura, E2E y CI/CD GitHub↔Cloudflare

> **Estado:** Borrador
> **Depende de:** SPEC 01, SPEC 02, SPEC 03
> **Fecha:** 2026-08-17
> **Objetivo:** Cerrar el ciclo con gate de cobertura ≥90%, un E2E Playwright y un workflow de GitHub Actions que testea en PR y despliega a Cloudflare en `main`.

## Por qué existe esta spec

Backend (SPEC 02) y frontend (SPEC 03) traen sus tests unitarios. Falta lo
transversal: (1) el **E2E** que valida el flujo real contra `wrangler dev`, (2) el
**gate** que rompe el build si la cobertura baja de 90%, y (3) el **CI/CD** que
encadena `test` → `deploy` con branch protection. Sin esto, el producto no se publica
solo ni se protege de regresiones.

## Alcance

**Dentro:**

- `test/e2e/` con Playwright: 1 flujo contra `wrangler dev` (dos clientes en una
  sala + dos salas aisladas).
- `playwright.config.ts` (arranca `wrangler dev` como webServer).
- Gate: verificar que `vitest.config.ts` (de SPEC 01) aplica los umbrales 90 en
  `test:web` (y backend) y que el CI corre con `--coverage`.
- `.github/workflows/ci-cd.yml`: jobs `test` y `deploy`.
- Documentación del setup: secrets de GitHub, branch protection, `README.md`
  (despliegue, uso por `curl` con `/r/<room>`, aviso de seguridad).

**Fuera de alcance (para futuras specs):**

- Preview deploys por PR (entorno `preview` en `wrangler.toml`) — Fase 2 opcional.
- Dominio propio.
- Rate-limiting / anti-abuso.

## Modelo de datos

Esta spec no introduce estructuras de datos nuevas. Configura herramientas y CI.

## Interfaces / API

No expone API de producto. Define el contrato de **CI**:

- Job `test` (en `pull_request` y `push`): `npm ci` → `typecheck` → `lint` →
  `test:backend` → `test:web -- --coverage` (gate) → `test:e2e`.
- Job `deploy` (`needs: test`, `if: github.ref == 'refs/heads/main'`):
  `npm run build` → `cloudflare/wrangler-action` con `command: deploy`.
- Secrets requeridos en GitHub: `CLOUDFLARE_API_TOKEN` (permiso Edit Workers),
  `CLOUDFLARE_ACCOUNT_ID`.

## Plan de implementación

1. `playwright.config.ts`: `webServer` que lanza `wrangler dev` (build previo del
   frontend), `baseURL` local. Verificación: `npm run test:e2e` arranca el server.
2. `test/e2e/chat.spec.ts`: abrir dos contextos en `/r/prueba`, enviar un mensaje de
   A, verlo en B; comprobar presencia; abrir `/r/a` y `/r/b` y verificar aislamiento.
   Verificación: `test:e2e` verde en local.
3. Confirmar el gate: correr `test:web -- --coverage` y comprobar que falla si la
   cobertura < 90 (bajar un test a propósito para verlo romper, luego revertir).
4. `.github/workflows/ci-cd.yml`: job `test` con los pasos del contrato + instalar
   navegadores Playwright. Verificación: el workflow parsea (act/lint YAML) y corre
   en un PR de prueba.
5. Añadir job `deploy` con `needs: test` e `if` de `main`, usando
   `cloudflare/wrangler-action`. Verificación: merge a `main` dispara `deploy`.
6. Documentar en `README.md`: pasos de despliegue, `curl` de agente con `/r/<room>`
   (brief, POST messages, GET ?sinceId=, POST presence), y el **aviso de seguridad**
   (es internet, salas adivinables, no meter secretos).
7. Documentar en el README el setup manual de: secrets en GitHub y branch protection
   en `main` exigiendo el check `test`.

## Criterios de aceptación

- [ ] `npm run test:e2e` levanta `wrangler dev`, abre dos clientes en `/r/prueba`, un
      mensaje de A aparece en B, y la presencia muestra a ambos.
- [ ] El E2E verifica que `/r/a` y `/r/b` están aislados (un mensaje en `a` no aparece
      en `b`).
- [ ] `npm run test:web -- --coverage` falla (exit ≠ 0) si la cobertura baja de 90% en
      cualquiera de las 4 métricas.
- [ ] `.github/workflows/ci-cd.yml` define un job `test` que corre `typecheck`,
      `lint`, `test:backend`, `test:web --coverage` y `test:e2e`.
- [ ] El job `deploy` tiene `needs: test` y solo corre en `refs/heads/main`.
- [ ] El job `deploy` usa `cloudflare/wrangler-action` con `command: deploy` y toma
      `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` de secrets.
- [ ] Un PR con un test roto deja el check `test` en rojo y (con branch protection)
      impide el merge.
- [ ] Merge a `main` con `test` verde publica en `*.workers.dev` (humo: la URL
      responde y sirve la Landing).
- [ ] `README.md` documenta despliegue, `curl` de agente con prefijo `/r/<room>` y el
      aviso de seguridad.

## Decisiones

- **Sí:** dos jobs (`test` → `deploy`) con `needs`. Un solo gate; deploy solo si los
  tests pasan y solo en `main`.
- **Sí:** E2E contra `wrangler dev` (no contra la nube). Prueba el Worker+DO reales
  sin depender del despliegue ni gastar en cada PR.
- **Sí:** gate de cobertura vía `vitest.config.ts` (thresholds), no un script aparte.
  Si baja, Vitest sale ≠ 0 y el CI se pone rojo sin lógica extra.
- **Sí:** branch protection documentada como paso manual. GitHub no la configura desde
  el repo; se deja en el README para el operador.
- **No:** preview deploys por PR (Fase 2 opcional). Añade un entorno `preview` y
  complejidad que no bloquea el lanzamiento.
- **No:** desplegar desde cualquier rama. Solo `main`, para que la URL pública refleje
  lo revisado.

## Casos borde

- E2E flaky por timing de WS → usar `expect.poll`/`waitFor` de Playwright en vez de
  sleeps fijos.
- `wrangler dev` que no arranca en CI → el `webServer` de Playwright falla claro; el
  job `test` se pone rojo.
- Secrets ausentes en un fork/PR externo → el job `deploy` no corre (solo en `main`);
  `test` sí, sin necesitar secrets de Cloudflare.
- Cobertura justo en 90.0% → el umbral es inclusivo (≥90 pasa); documentarlo para
  evitar sorpresas.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `wrangler deploy` falla al aplicar `[[migrations]]` de la DO | Migración declarada en `wrangler.toml` (SPEC 01); `wrangler deploy` la aplica sola. Humo tras deploy detecta fallos. |
| E2E lento infla el tiempo de CI | 1 solo flujo E2E; los casos finos se cubren en unit tests de 02/03. |
| Token de Cloudflare con permisos de más | Documentar token con solo "Edit Workers". |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Preview deploys por PR y entorno `preview` en `wrangler.toml` (Fase 2 opcional).
- Dominio propio (vs `*.workers.dev`).
- Rate-limiting / anti-abuso y autenticación.

Cada uno, si llega, va en su propia spec.
