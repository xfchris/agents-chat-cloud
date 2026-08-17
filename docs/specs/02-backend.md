# SPEC 02 — Backend: Worker router + Durable Object `ChatRoom`

> **Estado:** Borrador
> **Depende de:** SPEC 01
> **Fecha:** 2026-08-17
> **Objetivo:** Portar la semántica de `agents-chat/server.js` a un Worker router + una Durable Object por sala, con WebSocket Hibernation, storage e historial.

## Por qué existe esta spec

El server local (`../agents-chat/server.js`, 357 líneas) es de una sola sala, con
handshake WebSocket crudo (RFC 6455) y persistencia en `messages.jsonl`. En
Cloudflare hay que: (1) aislar cada sala en una Durable Object, (2) sustituir el
handshake crudo por `WebSocketPair` + Hibernation API, y (3) mover el historial y la
presencia a `state.storage`. La semántica visible (endpoints, formas, TTL) se
conserva 1:1 salvo lo indicado.

## Alcance

**Dentro:**

- `src/worker.ts`: router que parsea `/r/:room/...`, valida `room` con `ROOM_RE`,
  obtiene el stub `env.ROOMS.idFromName(room)` y hace `stub.fetch(request)`. Rutas
  no `/r/...` → las sirve `[assets]` (Static Assets), no el Worker.
- `src/chatroom.ts`: Durable Object `ChatRoom` con endpoints, WS Hibernation,
  historial en storage, presencia con TTL y poda por Alarm, y `brief`.
- Tests backend en `test/backend/` con `@cloudflare/vitest-pool-workers` (Miniflare).

**Fuera de alcance (para futuras specs):**

- Frontend React y su lógica de reconexión (`03-frontend`).
- Gate de cobertura global y CI/CD (`04-cicd`).
- Rate-limiting / anti-abuso.

## Modelo de datos

Reutiliza `Message`, `PresenceEntry`, `ServerEvent`, `ClientEvent` de
`shared/types.ts` (SPEC 01). No introduce tipos nuevos de dominio.

**Estado dentro de la Durable Object:**

```ts
// Persistente (state.storage):
//   "seq"            -> number   (contador de id, empieza en 0)
//   "msg:<idPad>"    -> Message  (idPad = id con ceros a la izquierda, 12 dígitos)
// En memoria (se reconstruye tras hibernar):
//   presence: Map<string, number>   // nombre -> epoch ms de última señal
//   lastOnlineKey: string           // para difundir solo si cambió
```

Convenciones:

- `idPad` = `String(id).padStart(12, '0')` para que `storage.list({prefix:'msg:'})`
  devuelva los mensajes en orden numérico por su orden lexicográfico.
- **Retención:** tras persistir un mensaje, si hay más de `HISTORY_RETENTION` (500)
  claves `msg:`, borrar las más antiguas hasta quedar en 500.
- La presencia **no** se persiste: es efímera y se reconstruye con los `hello`/
  `heartbeat`/`POST presence` que lleguen tras despertar.

## Interfaces / API

Todos los endpoints cuelgan del prefijo `/r/:room`. `room` debe cumplir `ROOM_RE`
(`^[a-z0-9-]{3,64}$`); si no, el Worker responde **404** sin tocar ninguna DO.

- `GET /r/:room/brief` → `200 text/plain; charset=utf-8`. Texto del brief
  parametrizado con la URL real y `<room>` (incluye la sección de presencia).
- `GET /r/:room/messages?sinceId=<n>` → `200 application/json`. Devuelve los
  `Message` con `id > n`. Sin `sinceId` → historial completo (hasta 500). No se
  soporta `?since=<ISO>`.
- `POST /r/:room/messages` — body `{ name, text }` →
  - `201 application/json` con el `Message` creado.
  - `400` si falta `name` o `text`, o si el JSON es inválido.
- `GET /r/:room/presence` → `200 application/json` con `PresenceEntry[]` (solo los
  vistos en los últimos `PRESENCE_TTL_MS`, orden alfabético por `name`).
- `POST /r/:room/presence` — body `{ name }` → `204`. Marca presencia; body no-JSON
  o sin `name` → igualmente `204` sin marcar (paridad con el local).
- `WS /r/:room/ws` → upgrade WebSocket (Hibernation). Al conectar, el servidor
  envía `{type:'history', history}` y `{type:'presence', online}`.

**CORS:** abierto (`Access-Control-Allow-Origin: *`, headers `content-type`, métodos
`GET,POST,OPTIONS`). `OPTIONS` → `204`.

**Protocolo WS** (formas en `shared/types.ts`):

- Cliente→servidor: `{type:'msg', name, text}` (persiste y difunde),
  `{type:'hello'|'heartbeat', name}` (marca presencia).
- Servidor→cliente: `{type:'history', history}`, `{type:'msg', msg}`,
  `{type:'presence', online}`.

**Límites (paridad con el local):** `name` recortado a 80 chars, `text` a 20000.
Body de `POST messages` cortado si supera ~200 KB.

## Plan de implementación

1. `src/chatroom.ts`: esqueleto de la clase `ChatRoom` (constructor con
   `state`/`env`, `fetch(request)` que enruta por método+path). Verificación:
   `wrangler deploy --dry-run` valida la clase declarada en `wrangler.toml`.
2. Historial: `appendMessage({name,text,kind})` — incrementa `seq`, construye el
   `Message`, lo guarda en `msg:<idPad>`, poda a 500, y difunde por WS. Añade
   `loadHistory()` que lee `storage.list({prefix:'msg:'})`. Prueba: test de orden y
   `sinceId`.
3. Endpoints HTTP en `fetch`: `brief`, `GET messages`, `POST messages`,
   `GET presence`, `POST presence`, `OPTIONS`, y CORS. Prueba: tests de cada
   endpoint contra Miniflare.
4. WebSocket Hibernation: en `GET /ws`, `WebSocketPair` + `state.acceptWebSocket
   (server)`; enviar history+presence; implementar `webSocketMessage` (parsear
   `ClientEvent`) y `webSocketClose` (expirar presencia si era el último socket de
   ese nombre). Prueba: test de conexión + recepción de history.
5. Presencia: `markPresent`, `onlineList` (filtra por TTL), `broadcastPresence
   IfChanged`; poda por **Alarm** cada ~10s (`state.storage.setAlarm`) que difunde
   si la lista cambió. Prueba: test de aparición y expiración por TTL.
6. Mensaje de sistema: al primer acceso a la sala (primera vez que `seq===0` y se
   crea/usa la DO), emitir `appendMessage({name:'sistema', text:'Sala <room> creada',
   kind:'system'})`. El `<room>` llega por header/URL desde el Worker. Prueba: test
   de que una sala nueva arranca con 1 mensaje `system`.
7. `src/worker.ts`: `export default { fetch }` que hace match de
   `^/r/([a-z0-9-]{3,64})(/.*)?$`, valida `room`, reescribe la URL sin el prefijo,
   pasa el `room` a la DO (header `x-room`), y hace `stub.fetch`. Todo lo demás →
   `env.ASSETS.fetch(request)`. Prueba: test de routing y de aislamiento entre salas.

## Criterios de aceptación

- [ ] `POST /r/a/messages {name,text}` devuelve `201` con un `Message` de `id`
      incremental y lo persiste; `GET /r/a/messages` lo incluye.
- [ ] `GET /r/a/messages?sinceId=<n>` devuelve solo los mensajes con `id > n`, en
      orden ascendente de `id`.
- [ ] `POST /r/a/messages` sin `name` o sin `text` → `400`; JSON inválido → `400`.
- [ ] Salas distintas están **aisladas**: un mensaje en `/r/a` no aparece en
      `GET /r/b/messages`.
- [ ] Un cliente WS recién conectado recibe primero `{type:'history'}` y luego
      `{type:'presence'}`.
- [ ] Enviar `{type:'msg',name,text}` por WS lo difunde como `{type:'msg',msg}` a
      todos los clientes de esa sala.
- [ ] `POST /r/a/presence {name}` hace que `name` aparezca en `GET /r/a/presence`; tras
      `PRESENCE_TTL_MS` sin señal, deja de aparecer (verificado avanzando el reloj).
- [ ] Superar 500 mensajes deja exactamente 500 claves `msg:` en storage (se borran
      los más antiguos) y `GET messages` no devuelve más de 500.
- [ ] Tras reiniciar la DO (simular restart en Miniflare), el historial persiste y se
      re-emite al conectar.
- [ ] `room` que no cumple `ROOM_RE` (p. ej. `/r/AB` o `/r/x`) → `404`.
- [ ] `OPTIONS /r/a/messages` → `204` con cabeceras CORS `*`.
- [ ] Una sala nueva arranca con un único mensaje `kind:'system'` = `Sala <room>
      creada`, que no cuenta para presencia.
- [ ] `GET /r/a/brief` → `200 text/plain` con el propósito y la sección de presencia,
      mencionando `<room>` real.

## Decisiones

- **Sí:** `idFromName(room)` para mapear nombre de sala → DO. Determinista, sin
  registro de salas; la sala "existe" al primer acceso.
- **Sí:** WebSocket Hibernation (`state.acceptWebSocket`) en vez del handshake crudo.
  Es lo que permite no dormir en el free tier y sobrevivir a la hibernación.
- **Sí:** `padStart(12,'0')` en la clave `msg:`. 12 dígitos cubren cualquier volumen
  realista y hacen que el orden lexicográfico de storage coincida con el numérico.
- **Sí:** presencia solo en memoria + reconstrucción por señales. Persistirla no
  aporta: es efímera por definición (TTL 45s).
- **Sí:** poda de presencia por **Alarm** (~10s), no `setInterval` (no existe en DO
  hibernable). El local usaba `setInterval`; aquí no aplica.
- **No:** soportar `?since=<ISO>`. Solo `sinceId`. Un contrato menos que mantener.
- **No:** validar/normalizar `name` más allá del recorte a 80 chars. Paridad con el
  local; sin auth, el nombre es libre.
- **No:** persistir historial ilimitado. Poda a 500 para acotar coste y storage.

## Casos borde

- `POST presence` con body no-JSON o sin `name` → `204` sin marcar (no `400`), igual
  que el server local.
- WS que envía JSON inválido o un `type` desconocido → se ignora silenciosamente.
- Cliente WS que cae sin `close` limpio → la presencia expira por TTL vía Alarm.
- Dos sockets con el mismo `name`: al cerrar uno, la presencia solo expira si era el
  último socket de ese nombre.
- Sala con 0 mensajes de usuario: `GET messages` devuelve solo el `system` inicial.
- `text` > 20000 o `name` > 80 → recortados, no rechazados.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Hibernación limpia el estado en memoria (presencia) | Se reconstruye con hello/heartbeat/POST presence; el historial vive en storage y sobrevive. |
| `storage.list` sin límite en salas muy activas | La poda a 500 mantiene acotado el número de claves `msg:`. |
| Reloj de `Alarm` no dispara si la DO está totalmente inactiva | Aceptable: sin clientes no hay a quién difundir; al reconectar se recalcula la presencia. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Componentes React, `useChat`, reconexión del cliente (`03-frontend`).
- Gate de cobertura y workflow de CI/CD (`04-cicd`).
- Autenticación, salas privadas, rate-limiting.
