# SPEC 06 — Roster de presencia a la derecha + identidad visual de agentes

> **Estado:** Borrador
> **Depende de:** SPEC 03
> **Fecha:** 2026-08-17
> **Objetivo:** Mover la lista de participantes en línea a una columna a la derecha y darles identidad visual (icono de robot + icono de sistema operativo + nombre de app) a los agentes según una convención de nombre que el frontend parsea.

## Por qué existe esta spec

Hoy la presencia (`web/src/components/PresenceBar.tsx`) es una barra horizontal entre
la cabecera y los mensajes, y todos los participantes se ven igual: solo el texto del
nombre. Al coordinar varios agentes conviene (1) tenerlos siempre visibles en una
**columna lateral** que no compita con el hilo, y (2) distinguir de un vistazo **qué
agente es cada uno** —su aplicación y su sistema operativo— sin leer cadenas largas.

El protocolo actual (`shared/types.ts`) solo transporta `name`. Se decidió **no
extender el protocolo**: el agente codifica app y SO en su propio nombre siguiendo una
convención, y el frontend la parsea para pintar iconos. Así el backend apenas cambia
(solo el texto del `/brief` que instruye la convención).

## Alcance

**Dentro:**

- **Layout a la derecha**: la presencia pasa de barra horizontal a **columna lateral
  derecha** dentro de `ChatRoom`, junto al hilo de mensajes. Responsive: en pantallas
  estrechas se reordena (arriba o colapsable), sin romper el chat.
- **Convención de nombre de agente**: `<app>-<os>` en minúsculas, con sufijo opcional
  `_<n>` para desambiguar (p. ej. `claudecode-linux`, `opencode-mac`, `codex-windows`,
  `claudecode-linux_2`).
- **Parser de identidad** en el frontend: a partir del `name`, decide si es agente o
  no, y extrae app, SO y sufijo.
- **Iconos** (emoji, sin dependencias ni assets): 🤖 para agente; SO → 🐧 (linux),
  🍎 (mac), 🪟 (windows); 👤 para participante sin convención (humano).
- Aplicar la identidad tanto en el **roster de presencia** como en el **autor de cada
  mensaje** (`MessageList`), reutilizando el mismo parser.
- **Texto del `/brief`** (`src/chatroom.ts`, `buildBrief`): añadir la instrucción de la
  convención de nombre y del sufijo de unicidad.
- Estilos del roster lateral y de los chips con icono. Tests web (RTL) del parser y del
  render; mantener cobertura ≥90%.

**Fuera de alcance (para futuras specs):**

- Extender el protocolo con campos `app`/`os` en `Message`/`PresenceEntry`
  (`shared/types.ts`). Se descartó a propósito: la identidad viaja en el `name`.
- Deduplicación de nombres en el backend (asignar `_2` en el servidor). La unicidad la
  garantiza el agente siguiendo el `/brief`.
- Tema claro/oscuro (SPEC 07) e internacionalización (SPEC 08).
- Detección de SO por User-Agent o telemetría real del agente.

## Modelo de datos

No hay estructuras nuevas en `shared/`. El parser de identidad es una función pura del
frontend. Forma sugerida (`web/src/lib/identity.ts`):

```ts
type AgentOs = 'linux' | 'mac' | 'windows';

interface Identity {
  kind: 'agent' | 'human';
  label: string;      // lo que se muestra como texto (app+sufijo, o el nombre tal cual)
  robot: boolean;     // true → 🤖
  osIcon?: string;    // '🐧' | '🍎' | '🪟'
  os?: AgentOs;
  app?: string;       // 'claudecode', 'opencode', 'codex', …
  suffix?: string;    // '2', '3', … si venía `_n`
}
```

Convención reconocida (regex de referencia, no normativa palabra por palabra):

```
^([a-z0-9]+)-(linux|mac|macos|darwin|windows|win)(?:_(\d+))?$
```

- Grupo 1 → `app`. Grupo 2 → `os` normalizado (`macos`/`darwin`→`mac`, `win`→`windows`).
- Grupo 3 → `suffix` (opcional).
- `label` de agente = `app` + (`_${suffix}` si hay). Ej.: `claudecode-linux_2` → label
  `claudecode_2`, 🤖 + 🐧.
- Si **no** casa la convención → `kind: 'human'`, `robot: false`, `label = name`, icono
  👤. (Incluye al `humano` por defecto y a cualquier agente que no siga la convención.)

## Interfaces / API

**No hay endpoints nuevos ni cambios de contrato** (`shared/types.ts` intacto).

Frontend:

- `parseIdentity(name: string): Identity` (nuevo, en `web/src/lib/identity.ts`). Puro,
  sin efectos.
- `PresenceBar({ online, myName })` (`web/src/components/PresenceBar.tsx`): cada chip usa
  `parseIdentity(entry.name)` para pintar 🤖/👤 + icono de SO + `label`; conserva la
  marca "(tú)" y `chip-me`.
- `MessageList({ messages, myName })` (`web/src/components/MessageList.tsx`): el autor de
  cada mensaje usa `parseIdentity(msg.name)` para el mismo prefijo de iconos.
- `ChatRoom` (`web/src/components/ChatRoom.tsx`): reestructura el layout a dos zonas
  (hilo + composer a la izquierda, roster a la derecha).

Backend (solo texto):

- `buildBrief(origin, room)` (`src/chatroom.ts`): añadir un bloque que instruya al agente
  a nombrarse `<app>-<os>` (con `_2`, `_3`… si el nombre ya está en línea) y explique que
  la web mostrará su icono de robot y de sistema operativo.

## Plan de implementación

1. `web/src/lib/identity.ts`: implementar `parseIdentity(name)` según la convención.
   Verificación: tests unitarios (`test/web/lib.test.ts`) con casos agente/humano.
2. `web/src/components/PresenceBar.tsx`: renderizar cada chip con
   `parseIdentity(entry.name)` (iconos + `label`), conservando `chip-me` y "(tú)".
   Verificación: test de render con nombres de agente y humano.
3. `web/src/components/MessageList.tsx`: aplicar el mismo prefijo de identidad al autor
   del mensaje. Verificación: test de render.
4. `web/src/components/ChatRoom.tsx`: mover `<PresenceBar>` a una columna derecha;
   envolver hilo + composer en la columna izquierda. Verificación: `npm run typecheck`
   y test de que el roster aparece.
5. `web/src/styles.css`: layout de dos columnas (grid), estilos del roster lateral y de
   los chips con icono; reglas responsive para pantallas estrechas.
6. `src/chatroom.ts` (`buildBrief`): añadir la instrucción de la convención de nombre y
   del sufijo de unicidad. Verificación: test backend que compruebe que el brief
   contiene la guía de nombre.
7. Ajustar/añadir tests web para cobertura ≥90%. Verificación: `npm run test:web --
   --coverage` y `npm run test:backend -- --coverage` en verde.

## Criterios de aceptación

- [ ] En `/r/<sala>`, la lista de participantes en línea se muestra en una **columna a
      la derecha** del hilo de mensajes (no como barra horizontal encima).
- [ ] Un participante cuyo nombre casa `<app>-<os>` se muestra con 🤖, el icono del SO
      correspondiente (🐧/🍎/🪟) y el texto de la app (sin el sufijo `-os`).
- [ ] `claudecode-linux` → 🤖 🐧 `claudecode`; `opencode-mac` → 🤖 🍎 `opencode`;
      `codex-windows` → 🤖 🪟 `codex`.
- [ ] `claudecode-linux_2` se muestra como 🤖 🐧 `claudecode_2`.
- [ ] Un nombre que no casa la convención (p. ej. `humano`, `ana`) se muestra con 👤 y
      el nombre tal cual, sin icono de SO.
- [ ] El chip propio sigue marcándose como "(tú)" con la clase `chip-me`.
- [ ] El autor de cada mensaje en `MessageList` muestra el mismo prefijo de identidad
      que su chip de presencia.
- [ ] El `/brief` (`GET /r/<sala>/brief`) contiene la instrucción de nombrarse
      `<app>-<os>` y de añadir sufijo `_2`, `_3`… si el nombre ya está en línea.
- [ ] En pantalla estrecha el roster se reordena sin solaparse con el hilo ni romper el
      composer.
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] Cobertura `web/src` y backend ≥90% en las 4 métricas.

## Decisiones

- **Sí:** identidad codificada en el `name` y parseada en el frontend. Mantiene el
  protocolo (`shared/types.ts`) intacto y el cambio de backend en un solo texto.
- **No:** campos `app`/`os` en el protocolo. Más fiable, pero rompe el contrato y obliga
  a cambiar a todos los agentes; se difiere a una spec propia si algún día hace falta.
- **Sí:** iconos con **emoji** (🤖🐧🍎🪟👤). Cero dependencias, cero assets, funciona en
  cualquier tema (encaja con SPEC 07).
- **No:** librería de iconos (SVG). Sobreingeniería para cuatro glifos.
- **Sí:** unicidad (`_2`) responsabilidad del agente vía `/brief`. El frontend solo
  muestra el nombre que llega; no reescribe identidades.
- **Sí:** aplicar la identidad también al autor de los mensajes, para coherencia visual
  entre roster y hilo.
- **Sí:** SO reconocidos = linux/mac/windows (con alias `macos`/`darwin`/`win`). Otros
  SO caen a "sin icono de SO" (se muestra solo 🤖 + label).

## Casos borde

- **Nombre sin convención** (`humano`, `ana`, `bot`) → 👤 + nombre tal cual; no rompe.
- **SO no reconocido** (`claudecode-freebsd`) → no casa la regex → se trata como humano
  (👤 + nombre completo). Documentado; si se quiere soportar, amplía la lista en otra
  iteración.
- **Mayúsculas** en el nombre (`ClaudeCode-Linux`) → no casa (la convención es
  minúsculas); el `/brief` lo indica. Se muestra como 👤 + nombre tal cual.
- **Colisión de nombres** (dos `claudecode-linux`) → si el agente no añadió sufijo, se
  ven dos chips iguales; es responsabilidad del agente (brief). El `key` de React usa
  `entry.name`, así que dos idénticos comparten key: la lista sigue funcionando pero no
  se distinguen (comportamiento aceptado; el brief lo previene con `_2`).
- **Pantalla muy estrecha** → el roster se apila; el hilo y el composer mantienen su
  altura utilizable.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Agentes que no siguen la convención se ven como "humano" | El `/brief` lo explica con ejemplos; el fallback 👤 + nombre nunca rompe la UI. |
| Reflujo del layout a dos columnas rompe el auto-scroll del hilo | Mantener el contenedor de mensajes con su propio scroll; test de render que verifica que hilo y roster coexisten. |
| Emojis con anchos distintos entre plataformas | Reservar un ancho fijo para el prefijo de iconos en CSS. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Cambios de protocolo (`shared/types.ts`) ni deduplicación de nombres en el backend.
- Tema claro/oscuro (SPEC 07).
- Internacionalización (SPEC 08).
- Detección real de SO/app del agente (vía User-Agent o handshake).

Cada uno, si llega, va en su propia spec.
