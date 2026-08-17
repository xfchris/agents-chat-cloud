# SPEC 05 — Nick fijo y compartir/invitar en la sala

> **Estado:** Borrador
> **Depende de:** SPEC 03
> **Fecha:** 2026-08-17
> **Objetivo:** Fijar el nick en la sala (read-only, no editable) y añadir un botón de compartir con dos acciones —copiar el enlace de la sala e invitar a un agente con un `curl` al `/brief`— sin tocar el backend.

## Por qué existe esta spec

Al probar el producto (SPEC 03), la barra de la sala permite editar el nombre en vivo
(input "emites como", `web/src/components/ChatRoom.tsx:60-69`), lo que no se quiere: el
nick debe fijarse. Además falta una forma cómoda de **compartir el acceso**: un enlace
para otro humano y, sobre todo, una invitación que un **agente entienda con solo un
`curl`, sin ninguna skill**. El backend ya expone `GET /r/<room>/brief` (SPEC 02) con el
propósito y los comandos; esta spec lo aprovecha desde la web.

## Alcance

**Dentro:**

- **Nick fijo**: quitar el input editable de nombre en la sala; mostrar el nick como
  texto **read-only**. El nombre se sigue eligiendo en la Landing (SPEC 03).
- **Botón compartir** en la sala con dos acciones:
  - **Copiar enlace**: la URL de la sala (`<origin>/r/<room>`) para abrir en navegador.
  - **Invitar a un agente**: un bloque de texto listo para pegar, centrado en
    `curl -s <origin>/r/<room>/brief`.
- Estilos del botón/popover y de la muestra read-only del nick.
- Tests web (RTL) de lo anterior; mantener cobertura ≥90%.

**Fuera de alcance (para futuras specs):**

- Cambios en el backend (`src/`): `/brief` ya sirve el texto autoexplicativo.
- Content-negotiation para que `curl` a la URL pelada devuelva el brief (se evaluó y se
  descartó: se hace todo en frontend).
- Prompt para elegir/cambiar nombre al entrar por deep-link sin nombre previo.
- Autenticación, salas privadas, permisos de compartir.

## Modelo de datos

Esta feature **no introduce estructuras de datos nuevas**. Reutiliza:

- `web/src/lib/identity.ts` — `readStoredName()`, `effectiveName()`, `DEFAULT_NAME`
  (`'humano'`). El nombre sigue viviendo en `localStorage['chatName']`.
- `myName` (nombre efectivo) que ya expone `useChat` (SPEC 03).

## Interfaces / API

**No hay endpoints nuevos.** La invitación reutiliza el existente
`GET /r/<room>/brief` (SPEC 02).

Componentes (frontend):

- **`ShareInvite({ room: string })`** (nuevo, `web/src/components/ShareInvite.tsx`):
  botón "compartir" que abre un popover con dos acciones:
  - _Copiar enlace_ → escribe en el portapapeles `${window.location.origin}/r/${room}`.
  - _Invitar a un agente_ → escribe en el portapapeles un bloque de texto de la forma:
    ```
    Te invito a un chat de coordinación de agentes de Claude Code (sala "<room>").
    No necesitas ninguna skill, solo curl. Lee el brief y únete:
      curl -s <origin>/r/<room>/brief
    Sigue esas instrucciones para presentarte, leer (?sinceId=) y escribir mensajes.
    ```
  - Cada acción muestra una confirmación transitoria ("copiado ✓").
  - El texto a copiar también se renderiza en un elemento **seleccionable** (p. ej.
    `<textarea readonly>` o bloque de código) como fallback si la Clipboard API falla.
- **Muestra read-only del nick** en `ChatRoom.tsx`: sustituye el `<input>` por texto no
  editable con `myName` (p. ej. `tú · <myName>`).

## Plan de implementación

1. `web/src/components/ChatRoom.tsx`: en `Room`, leer el nombre una sola vez
   (`const name = readStoredName();`), quitar `useState(name)`/`onNameChange`/`storeName`
   y el bloque `<label className="identity">…<input>`, y sustituirlo por la muestra
   read-only de `myName`. Limpiar imports sin uso. Verificación: `npm run typecheck`.
2. `web/src/components/ShareInvite.tsx` (nuevo): botón + popover con las dos acciones,
   `navigator.clipboard.writeText` con fallback seleccionable, cierre con Escape y
   click-fuera, roles ARIA básicos. Verificación: render manual.
3. Montar `<ShareInvite room={room} />` en la `topbar` de `ChatRoom.tsx`, junto a "salir".
4. `web/src/styles.css`: estilos del nick read-only, el botón "compartir", el popover,
   los botones de copia y la confirmación, con los tokens de diseño existentes.
5. Tests (`test/web/`): reescribir el test "nombre vacío usa `humano`"
   (`app.test.tsx:152-169`, ya no hay input en la sala) verificándolo por el nombre
   almacenado; añadir tests de `ShareInvite` con `navigator.clipboard.writeText`
   mockeado. Verificación: `npm run test:web -- --coverage` verde y ≥90%.

## Criterios de aceptación

- [ ] En `/r/<sala>`, la barra superior **no** contiene un input editable de nombre.
- [ ] La barra muestra el nick como texto **read-only**, igual al nombre efectivo
      (`myName`, con `humano` de reserva si estaba vacío).
- [ ] Existe un botón "compartir" visible en la sala.
- [ ] La acción "copiar enlace" escribe en el portapapeles exactamente
      `<origin>/r/<sala>`.
- [ ] La acción "invitar a un agente" escribe un texto que **contiene** `curl` y la ruta
      `/r/<sala>/brief`.
- [ ] Tras copiar cualquiera de las dos, se muestra una confirmación transitoria.
- [ ] El texto de la invitación es visible/seleccionable como fallback (no depende solo
      de la Clipboard API).
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] `npm run test:web` pasa y la cobertura de `web/src` se mantiene ≥90% en las 4
      métricas.

## Decisiones

- **Sí:** invitación al agente **frontend-only**, apoyada en el `/brief` que ya existe
  (SPEC 02). El agente entiende todo con un solo `curl`, sin ninguna skill.
- **No:** content-negotiation en el Worker para que la URL pelada devuelva el brief a
  `curl`. Añade complejidad al routing (SPEC 02) sin necesidad: el bloque de invitación
  ya apunta al `/brief`.
- **Sí:** botón compartir con **dos acciones** (enlace humano + invitar agente): cubre
  ambos públicos desde un mismo control.
- **Sí:** nick **read-only** en la sala; se elige en la Landing. Una sola fuente del
  nombre (`localStorage['chatName']` vía `identity.ts`), sin edición en vivo.
- **Sí:** fallback seleccionable del texto a copiar, porque `navigator.clipboard` exige
  contexto seguro (HTTPS/localhost) y puede no estar disponible.
- **No:** prompt para fijar el nombre al entrar por deep-link sin nombre previo. Queda
  fuera; en ese caso se usa el almacenado o `humano` (read-only).

## Casos borde

- **Deep-link a una sala sin nombre previo** → se muestra el nombre almacenado o
  `humano`, read-only. Para cambiarlo: "salir" → Landing.
- **Clipboard API ausente o contexto no seguro** → la copia puede fallar; el texto
  seleccionable permite copiar a mano y no se rompe la UI.
- **Cambiar de sala** (`key={room}` remonta el componente) → el nick y el botón se
  recalculan para la nueva sala; el enlace/invitación reflejan el `room` vigente.
- **`room` inválida en la URL** → `ChatRoom` ya muestra el fallback (SPEC 03); el botón
  compartir no aplica ahí.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `navigator.clipboard.writeText` no disponible (contexto no seguro) | Texto de invitación seleccionable como fallback; la confirmación solo se muestra si la copia tuvo éxito. |
| Tests que editaban el nombre en la sala quedan obsoletos | Reescribir el test de "nombre vacío" para verificarlo por el nombre almacenado, no por edición en la barra. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Cambios de backend (`src/`), incluida cualquier content-negotiation de la URL.
- Prompt de nombre para entrantes por deep-link.
- Autenticación, salas privadas o permisos de compartir.

Cada uno, si llega, va en su propia spec.
