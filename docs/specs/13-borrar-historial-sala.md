# SPEC 13 — Borrar el historial de una sala (botón en la web)

> **Estado:** Borrador
> **Depende de:** SPEC 02, SPEC 03, SPEC 08, SPEC 12
> **Fecha:** 2026-08-18
> **Objetivo:** Permitir borrar **todo el historial** de una sala desde un botón en la cabecera de la web (con confirmación), vaciando el almacenamiento de la Durable Object y refrescando a todos los conectados en vivo.

## Por qué existe esta spec

Hoy el historial de una sala solo se poda por **cantidad** (`HISTORY_RETENTION = 500`); no
hay TTL por tiempo ni forma de borrarlo. No existe ninguna ruta `DELETE` ni acción en la
web. Se quiere un botón en cada sala para **vaciar el historial completo** de esa sala, con
una confirmación (el borrado es irreversible) y propagación en vivo a todos los clientes.

## Alcance

**Dentro:**

- **Contrato (`shared/types.ts`):** nuevo `ServerEvent` `{ type: 'cleared' }` que indica a los
  clientes que vacíen su lista de mensajes.
- **Backend (`src/chatroom.ts`):**
  - Nueva ruta `DELETE /r/:room/messages`: borra todas las claves `msg:*` del storage
    (mantiene el contador `seq` monótono), difunde `{ type: 'cleared' }` y añade un mensaje
    `kind:'system'` con texto `Historial borrado`.
  - Añadir `DELETE` a `Access-Control-Allow-Methods`.
  - `buildBrief`: documentar el `curl` de borrado (para que un agente también pueda hacerlo).
- **Frontend (`web/src/`):**
  - Nuevo componente `ClearHistory` en la cabecera de la sala: botón (con `Tooltip` de SPEC
    12) que abre una **confirmación en línea** («¿Borrar todo el historial?» · Sí / Cancelar,
    estilo popover como `ShareInvite`, sin `window.confirm`). Al confirmar hace
    `DELETE /r/:room/messages`.
  - `useChat`: manejar `{ type: 'cleared' }` vaciando los mensajes (`setMessages([])`). La UI
    se actualiza por el evento WS, no por la respuesta del `fetch` (fuente única).
  - i18n de los textos nuevos en `{es,en,pt,zh}.json`.
- Tests backend (Miniflare) y web (RTL). Cobertura ≥90% en backend y en `web/src`.

**Fuera de alcance (para futuras specs):**

- Autenticación / permisos para borrar. Las salas **no tienen auth** (por diseño); la
  confirmación en el cliente es la única salvaguarda. Cualquiera con el código de sala puede
  borrar.
- Borrado selectivo de mensajes individuales, o «papelera» / deshacer. El borrado es total e
  irreversible.
- Borrar la presencia o cerrar los WebSockets: la presencia es en memoria y se mantiene.
- Expiración por tiempo (TTL) del historial. Sigue siendo poda por cantidad (500).
- Traducir el mensaje de sistema `Historial borrado` (los `kind:'system'` quedan en español,
  como en SPEC 08).

## Modelo de datos

No hay estructuras nuevas. Cambia **solo** `ServerEvent`:

```ts
// shared/types.ts
export type ServerEvent =
  | { type: 'history'; history: Message[] }
  | { type: 'msg'; msg: Message }
  | { type: 'presence'; online: PresenceEntry[] }
  | { type: 'cleared' };            // nuevo: los clientes vacían su lista de mensajes
```

- El borrado elimina las claves `msg:*` del `state.storage`. **No** se reinicia `seq`
  (se mantiene monótono) para no romper el filtrado por `?sinceId=` de los agentes: el
  mensaje `Historial borrado` recibe el siguiente id y un agente que sondea con
  `?sinceId=<viejo>` lo verá.

## Interfaces / API

**Backend (nuevo método en la ruta existente):**

- `DELETE /r/:room/messages` →
  - Borra todos los mensajes de la sala; difunde `{ type: 'cleared' }` por WS; añade
    `{ kind:'system', text:'Historial borrado' }` (que se difunde como `{ type:'msg' }`).
  - Respuesta `200` con `{ cleared: <n> }` (número de mensajes borrados) o `204`. El
    cliente **no** depende del body: refresca por el evento WS.
- `GET /r/:room/brief` → añade una línea de ejemplo:
  ```
  borrar historial: curl -s -X DELETE <base>/messages
  ```
- CORS: `Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS`.

**Frontend:**

- `web/src/components/ClearHistory.tsx` (nuevo): botón + confirmación en línea; al confirmar,
  `fetch(`${apiBase(room)}/messages`, { method: 'DELETE' })` (reutiliza `apiBase`/patrón de
  `lib/api.ts`). Cierra la confirmación con Escape y click-fuera (como `ShareInvite`).
- `web/src/hooks/useChat.ts`: en el `onmessage`, `else if (event.type === 'cleared') setMessages([])`.
- Montaje de `<ClearHistory room={room} />` en la cabecera de `ChatRoom`.

Claves i18n nuevas (mismas en los 4 idiomas):

```jsonc
{
  "clear": {
    "button": "Borrar historial",
    "tooltip": "Borrar todo el historial de la sala",
    "confirm": "¿Borrar todo el historial? No se puede deshacer.",
    "yes": "Sí, borrar",
    "cancel": "Cancelar"
  }
}
```

## Plan de implementación

1. `shared/types.ts`: añadir `{ type: 'cleared' }` a `ServerEvent`. Verificación: `typecheck`.
2. `src/chatroom.ts`: rama `DELETE /messages` → `handleClearHistory` (borra `msg:*`, difunde
   `cleared`, añade el system message); añadir `DELETE` a Allow-Methods. Verificación: test
   backend de que tras el DELETE, `GET /messages` devuelve solo el system message.
3. `src/chatroom.ts` `buildBrief`: línea del `curl` de borrado. Verificación: `GET /brief`
   la incluye.
4. Tests backend (Miniflare) del borrado y de la difusión. Verificación: `npm run test:backend`.
5. `useChat.ts`: manejar `cleared` vaciando `messages`. Verificación: test de que el evento
   deja la lista vacía.
6. `ClearHistory.tsx` + montaje en `ChatRoom`. Confirmación en línea con Tooltip. Verificación:
   test de que confirmar dispara `DELETE` al endpoint correcto y cancelar no.
7. i18n en los 4 idiomas + estilos del botón/confirmación (tokens de tema; toque «peligro»
   sutil). Verificación: `npm run test:web -- --coverage` y `npm run build`.

## Criterios de aceptación

- [ ] Existe un botón «Borrar historial» en la cabecera de la sala (`/r/<sala>`), con su
      tooltip.
- [ ] Al pulsarlo aparece una **confirmación** («¿Borrar todo el historial?…») con «Sí,
      borrar» y «Cancelar»; **Cancelar** no borra nada.
- [ ] Al confirmar, se hace `DELETE /r/:room/messages` y el historial de esa sala queda
      vacío (solo el mensaje de sistema `Historial borrado`).
- [ ] **Todos** los clientes conectados a esa sala ven el historial vaciarse en vivo (evento
      `{ type: 'cleared' }`), sin recargar.
- [ ] Una nueva conexión a la sala tras el borrado recibe el historial ya vacío (solo el
      system message).
- [ ] El borrado de una sala **no** afecta a otras salas (aislamiento de la DO).
- [ ] `DELETE` está en `Access-Control-Allow-Methods`; el preflight OPTIONS lo permite.
- [ ] `GET /r/:room/brief` documenta el `curl -X DELETE` de borrado.
- [ ] Los textos del botón/confirmación salen de i18n en los 4 idiomas.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` pasan (exit 0).
- [ ] Cobertura ≥90% en backend y en `web/src` (4 métricas cada uno).

## Decisiones

- **Sí:** `DELETE /r/:room/messages` (reutiliza la ruta y el router existentes; el worker ya
  reenvía cualquier método al DO). No hace falta endpoint nuevo ni cambios en `worker.ts`.
- **Sí:** nuevo evento `{ type: 'cleared' }`. El cliente hace `history.forEach(ingest)`
  (fusiona, no reemplaza), así que reenviar `history` no vaciaría la vista; un evento
  explícito es la forma limpia.
- **No:** reiniciar `seq` a 0. Mantenerlo monótono evita romper el `?sinceId=` de los agentes
  y colisiones de ids con clientes que aún recuerdan ids viejos.
- **Sí:** añadir un mensaje `kind:'system'` `Historial borrado` como traza/feedback, igual
  que `Sala <room> creada`.
- **Sí:** confirmación **en línea** (popover/dos pasos), no `window.confirm` (evita diálogos
  nativos que bloquean, y es testeable en RTL). Coherente con `ShareInvite`.
- **No:** autenticación para borrar. Las salas son sin auth por diseño; la confirmación es la
  salvaguarda. Se documenta el riesgo.
- **Sí:** la UI se refresca por el evento WS, no por la respuesta del `fetch` (fuente única de
  verdad; también cubre a los demás clientes).

## Casos borde

- **Sala ya vacía** → el DELETE es idempotente: borra 0 mensajes, igual difunde `cleared` y
  añade el system message (o, si se prefiere, no añade otro; decisión de implementación:
  añadirlo es aceptable).
- **Dos borrados casi simultáneos** → ambos vacían; el segundo borra lo que quede. Sin estado
  corrupto (operaciones de storage secuenciales en la DO).
- **Cliente desconectado durante el borrado** → al reconectar recibe el `history` ya vacío
  (solo el system message). No necesita el evento `cleared`.
- **Agente sondeando con `?sinceId=<viejo>`** → como `seq` no se reinicia, el system message
  `Historial borrado` tiene un id mayor y lo recibe.
- **`fetch` DELETE falla (red)** → la confirmación muestra el error / no vacía; el historial
  no se toca (el borrado ocurre server-side y solo entonces se difunde `cleared`).
- **Otra sala** → intacta (objetos distintos).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Borrado accidental (irreversible) | Confirmación explícita de dos pasos antes del `DELETE`. |
| Sin auth: cualquiera con el código de sala puede borrar | Aceptado por diseño (salas sin auth); documentado. Auth queda para otra spec. |
| Clientes no se enteran del borrado | Evento `{ type: 'cleared' }` difundido a todos; test que lo cubre. |
| Romper `?sinceId=` de agentes al borrar | No se reinicia `seq`; el system message lleva id mayor. |
| Tests que asumían `ServerEvent` cerrado | Ampliar el tipo/manejo; el `default` ignora tipos desconocidos. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Autenticación/permisos para borrar.
- Borrado selectivo, papelera o deshacer.
- Expiración por tiempo (TTL) del historial.
- Traducir el mensaje de sistema `Historial borrado`.

Cada uno, si llega, va en su propia spec.
