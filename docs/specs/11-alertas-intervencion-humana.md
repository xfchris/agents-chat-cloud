# SPEC 11 — Alertas de intervención humana (campana + notificaciones)

> **Estado:** Borrador
> **Depende de:** SPEC 02, SPEC 03, SPEC 06, SPEC 07, SPEC 08
> **Fecha:** 2026-08-17
> **Objetivo:** Permitir que un agente marque un mensaje como «necesito intervención humana» y que la web lo resalte, suene una campana y —si el usuario lo activó— lance una notificación del navegador.

## Por qué existe esta spec

Coordinando agentes por `curl`, a veces un agente se bloquea y necesita a una persona
(una decisión, una credencial, un desbloqueo). Hoy ese mensaje se pierde entre el resto
del hilo: si el humano no está mirando la pestaña, no se entera. Hace falta una señal
**semántica** (no un texto convenido) que el agente emita y que la web convierta en una
alerta perceptible: resalte visual, sonido y, opcionalmente, notificación del sistema.

Se introduce un tercer tipo de mensaje, `kind:'attention'`, que viaja por el mismo
endpoint y el mismo WebSocket que los mensajes normales, reutilizando historial y
difusión. El agente solo necesita `curl`; ninguna skill.

## Alcance

**Dentro:**

- **Contrato (`shared/types.ts`):** ampliar `MessageKind` a `'msg' | 'system' | 'attention'`.
- **Backend (`src/chatroom.ts`):**
  - `handlePostMessage` acepta un campo opcional `kind` en el body; solo permite
    `'attention'` (cualquier otro valor, incluido `'system'`, cae a `'msg'`).
  - `buildBrief` documenta cómo pedir intervención con `curl` (ejemplo con `kind`).
  - Tests backend (Miniflare) del nuevo camino.
- **Frontend (`web/src/`):**
  - `MessageList`: los mensajes `kind:'attention'` se renderizan resaltados, con un
    icono de campana y una etiqueta traducida («Intervención»), en cualquier idioma y
    tema.
  - Lógica de alerta al recibir en vivo (evento WS `{type:'msg'}`, no en el `history`) un
    mensaje `kind:'attention'` de otro participante:
    - **Campana:** un timbre corto generado con la **Web Audio API** (sin fichero), una
      vez por mensaje.
    - **Notificación del navegador:** solo si el usuario activó el toggle, el permiso está
      concedido y no está viendo la sala — pestaña oculta (`document.hidden`) **o** la
      ventana sin foco (`!document.hasFocus()`, p. ej. trabajando en su IDE/terminal).
  - `NotificationToggle`: control en la cabecera de la sala para activar/desactivar las
    notificaciones; al activarlo pide permiso (`Notification.requestPermission()`) y
    persiste la preferencia en `localStorage`.
  - Claves i18n nuevas en `{es,en,pt,zh}.json` (etiqueta del mensaje, tooltip y textos del
    toggle, título y cuerpo de la notificación).
- Tests web (RTL) del render resaltado, del disparo de la campana y de la lógica del
  toggle/notificación. Cobertura ≥90% en backend y en `web/src`.

**Fuera de alcance (para futuras specs):**

- Un botón en la web para que un **humano** eleve una alerta (extiende `ClientEvent`; hoy
  la web solo **recibe** alertas). El emisor es el agente vía POST.
- Estado de «reconocido» (ack) o silenciar/campana en bucle: la campana suena una vez por
  mensaje, sin estado persistente.
- Notificaciones push cuando la pestaña está cerrada (Service Worker / Web Push).
- Traducir el `/brief` o los mensajes de sistema (siguen en español, como en SPEC 08).
- Prioridades/niveles de alerta o enrutado a personas concretas.

## Modelo de datos

Cambia **solo** el tipo del `kind`; la forma de `Message` no gana campos:

```ts
// shared/types.ts
export type MessageKind = 'msg' | 'system' | 'attention';
```

- Un mensaje de alerta es un `Message` normal con `kind: 'attention'`. Se persiste,
  se poda (retención 500) y se difunde igual que un `'msg'`.
- Preferencia de notificaciones del usuario: `localStorage['notifyOnAttention']` con
  valor `'1'` (activado) o ausente/otro (desactivado).

## Interfaces / API

**Backend (contrato ampliado, no nuevo endpoint):**

- `POST /r/:room/messages` — body `{ name: string, text: string, kind?: 'attention' }`.
  - Sin `kind` o con cualquier valor distinto de `'attention'` → se crea con `kind:'msg'`
    (comportamiento actual intacto).
  - Con `kind:'attention'` → se crea con `kind:'attention'`. `'system'` **nunca** se acepta
    desde el cliente.
  - Respuesta `201` con el `Message` creado, igual que hoy.
- `GET /r/:room/brief` — el texto añade un bloque de ejemplo:
  ```
  pedir intervención humana:
    curl -s -X POST <base>/messages -H 'content-type: application/json' \
      -d '{"name":"<tu-nombre>","text":"<qué necesitas>","kind":"attention"}'
  ```
- WebSocket: sin cambios de forma. `{ type: 'msg'; msg }` ya transporta el `Message`; el
  cliente distingue por `msg.kind`.

**Frontend:**

- `web/src/lib/bell.ts` (nuevo): `playBell(): void` — genera un timbre corto con Web Audio
  API; reutiliza un único `AudioContext`, lo reanuda (`resume()`) si está suspendido, y no
  lanza si la API no existe.
- `web/src/lib/notify.ts` (nuevo): helpers puros — `notifyEnabled()`, `setNotifyEnabled()`,
  `requestNotifyPermission()`, `showAttentionNotification(msg, t)`; defensivos si
  `Notification`/`localStorage` no existen.
- `web/src/components/NotificationToggle.tsx` (nuevo): botón/switch en la cabecera de la
  sala; refleja el estado y pide permiso al activarlo.
- `web/src/components/MessageList.tsx`: rama de render para `kind:'attention'`.
- Enganche de la alerta en el flujo de `useChat`/`ChatRoom` al llegar un `msg` en vivo con
  `kind:'attention'` cuyo `name` no es el mío.

Claves i18n nuevas (mismas en los cuatro idiomas):

```jsonc
{
  "attention": {
    "label": "Intervención",
    "toggleOn": "Activar avisos", "toggleOff": "Desactivar avisos",
    "tooltip": "Avisar cuando un agente pida intervención",
    "notifyTitle": "Intervención requerida",
    "notifyBody": "{{name}} pide ayuda en la sala"
  }
}
```

## Plan de implementación

1. `shared/types.ts`: ampliar `MessageKind` con `'attention'`. Verificación:
   `npm run typecheck` en verde en raíz y web.
2. `src/chatroom.ts` (`handlePostMessage`): leer `kind` del body y aceptar solo
   `'attention'`; el resto → `'msg'`. Verificación: POST con `kind:'attention'` devuelve un
   `Message` con ese kind; POST con `kind:'system'` lo degrada a `'msg'`.
3. `src/chatroom.ts` (`buildBrief`): añadir el bloque de ejemplo de intervención.
   Verificación: `GET /brief` incluye el `curl` con `kind:'attention'`.
4. Tests backend del paso 2 y 3. Verificación: `npm run test:backend` verde.
5. `web/src/lib/bell.ts`: timbre con Web Audio API. Verificación: llamar `playBell()` no
   lanza aunque el `AudioContext` esté mockeado.
6. `web/src/lib/notify.ts` + `NotificationToggle.tsx`: preferencia, permiso y toggle en la
   cabecera. Verificación: activar pide permiso y persiste; desactivar limpia la preferencia.
7. `MessageList.tsx`: render resaltado de `kind:'attention'` con icono y etiqueta i18n.
   Verificación: un mensaje `attention` se ve distinto de uno `msg`.
8. Enganche de la alerta en vivo (campana siempre; notificación si toggle+permiso+pestaña
   oculta) para `msg` entrantes con `kind:'attention'` ajenos. Verificación: test que simula
   la llegada y comprueba que se invoca la campana y (con las condiciones) la notificación.
9. Estilos del mensaje de alerta y del toggle en `styles.css`, con tokens de tema.
   Verificación: se ve bien en claro y oscuro.
10. Claves i18n en los cuatro idiomas y ajuste de cobertura. Verificación:
    `npm run test:web -- --coverage` y `npm run test:backend` verdes, ≥90%.

## Criterios de aceptación

- [ ] `POST /r/:room/messages` con `{name,text,kind:"attention"}` responde `201` y el
      `Message` tiene `kind:"attention"`.
- [ ] `POST` con `kind:"system"` (o cualquier valor no soportado) crea el mensaje con
      `kind:"msg"`; el cliente no puede inyectar mensajes de sistema.
- [ ] `POST` sin `kind` sigue creando `kind:"msg"` (comportamiento actual intacto).
- [ ] `GET /r/:room/brief` incluye un ejemplo `curl` para pedir intervención con
      `kind:"attention"`.
- [ ] En la web, un mensaje `kind:"attention"` se muestra resaltado, con icono de campana y
      la etiqueta traducida.
- [ ] Al llegar en vivo un mensaje `kind:"attention"` de otro participante, suena la campana
      una vez.
- [ ] La campana **no** suena al cargar el historial (mensajes `attention` previos) ni por
      un `attention` cuyo `name` es el mío.
- [ ] Con el toggle activado, permiso concedido y el usuario sin ver la sala (pestaña
      oculta **o** ventana sin foco), llega una notificación del navegador con nombre del
      emisor.
- [ ] Con el toggle desactivado no llega ninguna notificación (pero la campana sí suena).
- [ ] La preferencia del toggle persiste en `localStorage` y se conserva al recargar.
- [ ] Todos los textos nuevos salen de i18n en los cuatro idiomas.
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] Cobertura ≥90% en backend y en `web/src` (4 métricas cada uno).

## Decisiones

- **Sí:** nuevo `kind:'attention'` reutilizando `POST /messages` y el WS. Aprovecha
  historial, poda y difusión; el mensaje queda en el hilo. Cambio de contrato mínimo.
- **No:** endpoint dedicado `POST /r/:room/attention`. Duplicaría la difusión y sacaría la
  alerta del historial sin ganar nada.
- **No:** convención en el texto (prefijo `@human`). Frágil, sin semántica, colisiona con
  mensajes normales.
- **Sí:** la campana suena **una vez** por mensaje, sin estado de ack. Simple y no
  intrusivo; un bucle hasta reconocer exigiría estado y un botón de ack (fuera de alcance).
- **Sí:** notificación del navegador **opt-in** por toggle y solo cuando el usuario no está
  viendo la sala. Evita el auto-prompt de permiso (mala UX, a menudo bloqueado) y el doble
  aviso cuando ya está mirando.
- **Sí:** «no está viendo» = `document.hidden` **o** `!document.hasFocus()`. Solo `hidden`
  se queda corto: cambiar de aplicación (a un IDE/terminal) no oculta la pestaña, y ese es
  el caso típico del coordinador; `hasFocus()` lo capta.
- **Sí:** sonido con **Web Audio API** generado. Sin asset binario, offline, cero ficheros
  que versionar.
- **No:** fichero de audio empaquetado. Más agradable, pero añade binario al repo/bundle.
- **Sí:** el `'system'` sigue siendo inyectable solo por el servidor; el cliente jamás lo
  puede fijar por el body.
- **No (por ahora):** que un humano eleve alertas desde la web. El emisor es el agente; la
  web recibe. Extender `ClientEvent` es otra spec.

## Casos borde

- **Autoplay bloqueado:** los navegadores no dejan sonar Web Audio sin gesto previo del
  usuario. `playBell()` reanuda el `AudioContext`; si aún no hubo interacción, la campana
  puede quedar muda hasta el primer clic/tecla en la sala. Degradación aceptable; la
  notificación y el resalte visual no dependen del audio.
- **Permiso de notificación denegado:** el toggle puede quedar activado en preferencia pero
  sin permiso; no se muestra notificación (la campana sigue). No re-preguntar en bucle.
- **`Notification` o `localStorage` ausentes:** el toggle se degrada (no persiste / no
  notifica) sin romper la sala.
- **Sala a la vista y enfocada:** con la pestaña visible Y la ventana con foco no se
  notifica aunque el toggle esté activo; la campana y el resalte bastan. Si el foco se va a
  otra app (pestaña aún visible) sí se notifica: el coordinador no está mirando.
- **`attention` en el historial al entrar:** se renderiza resaltado pero **no** dispara
  campana ni notificación (no es un evento en vivo).
- **Ráfaga de alertas:** cada mensaje `attention` suena una vez; no se agrupan (aceptable
  para el volumen esperado).
- **Body con `kind` no string** → se trata como ausente → `kind:'msg'`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El bloqueo de autoplay deja la campana muda al inicio | Reanudar `AudioContext` en `playBell` y en el primer gesto; el resalte visual y la notificación cubren el aviso. |
| Fatiga de alertas si un agente abusa de `attention` | La campana suena una vez por mensaje, sin bucle; el resalte lo hace visible sin ser modal. |
| Permisos de notificación inconsistentes entre navegadores | Toggle opt-in + comprobación de `Notification.permission`; degradar en silencio si falla. |
| Tests que asumían `MessageKind` binario | Actualizar los tipos/tests; el default sigue siendo `'msg'`. |
| Un cliente intenta fijar `kind:'system'` | El backend lo degrada a `'msg'` explícitamente; test que lo cubre. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Botón en la web para que un humano eleve alertas (extiende `ClientEvent`).
- Estado de «reconocido» (ack), silenciar o campana en bucle.
- Web Push / Service Worker para pestaña cerrada.
- Traducción del `/brief` y de los mensajes de sistema.
- Niveles de prioridad o enrutado a personas concretas.

Cada uno, si llega, va en su propia spec.
