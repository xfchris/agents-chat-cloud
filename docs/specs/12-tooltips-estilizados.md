# SPEC 12 — Tooltips estilizados (componente propio, sin librerías)

> **Estado:** Borrador
> **Depende de:** SPEC 07, SPEC 08, SPEC 10, SPEC 11
> **Fecha:** 2026-08-17
> **Objetivo:** Sustituir el atributo `title` nativo por un componente `Tooltip` propio, estilizado (aire «oscuro compacto» tipo Bootstrap), accesible y traducido, en todos los iconos/controles que hoy usan `title`.

## Por qué existe esta spec

La SPEC 10 añadió tooltips con el atributo `title` nativo: accesible y sin dependencias,
pero feo (estilo del sistema operativo, sin control de posición, con retardo largo fijo y
sin encajar con la estética de la app). El `title` nativo se dejó explícitamente como
solución provisional, con los «tooltips estilizados» como trabajo futuro. Esta spec cumple
ese futuro: un componente `Tooltip` reutilizable con look propio, que funciona con ratón y
con teclado, respeta el tema claro/oscuro y reusa las traducciones ya existentes.

No se añade Bootstrap ni MaterialUI: este proyecto es deliberadamente **sin librerías de
UI** (va a Cloudflare, bundle mínimo). Se replica su *look & feel* con CSS + React propios.

## Alcance

**Dentro:**

- **Componente nuevo** `web/src/components/Tooltip.tsx`: envuelve un único elemento
  disparador y muestra una burbuja con `role="tooltip"`.
  - Se muestra al **hover** (con un retardo corto de aparición) y al **foco de teclado**
    (inmediato); se oculta al salir el ratón, al perder el foco (`blur`) y con **Escape**.
  - Enlace accesible: el disparador recibe `aria-describedby` apuntando a la burbuja.
  - Prop `placement: 'top' | 'bottom'` (por defecto `'top'`).
- **Sustitución de `title` por `<Tooltip>`** en:
  - `OsIcon` (nombre del SO) — placement `top`.
  - `IdentityPrefix` (Agente/Persona) — placement `top`.
  - `ThemeToggle`, `LanguageSwitcher`, `ShareInvite` (botón), `NotificationToggle` — todos
    en la **cabecera**, así que placement `bottom` (evita recortarse contra el borde
    superior de la ventana).
- **Se elimina el atributo `title`** de esos elementos (nada de doble tooltip nativo +
  propio). Los `aria-label` de los controles se conservan intactos.
- **Estilos** en `web/src/styles.css`: tokens `--tooltip-*`, la burbuja, la flecha, las dos
  posiciones y la animación de entrada. Válidos en tema claro y oscuro.
- **i18n**: se reutilizan las claves ya existentes (`os.*`, `identity.*`, `tooltip.*`,
  `attention.tooltip`). No se crean claves nuevas.
- Tests web (RTL): del componente `Tooltip` y actualización de los tests de SPEC 10/11 que
  hoy consultan por `title`/`getByTitle`. Cobertura `web/src` ≥90%.

**Fuera de alcance (para futuras specs):**

- **Reposicionamiento dinámico / flip automático** contra los bordes del viewport (requiere
  medir con `getBoundingClientRect` en JS). Se usa placement estático por sitio de uso.
- Placements laterales (`left`/`right`) y tooltips con contenido rico (HTML, enlaces).
- Tooltips en la Landing u otros elementos que hoy **no** tienen `title`.
- Tooltips táctiles (en móvil no hay hover; el icono sigue teniendo su `aria-label`).
- Portal a `document.body` / z-index global avanzado: la burbuja se posiciona relativa a su
  envoltorio.

## Modelo de datos

Esta feature no introduce estructuras de datos ni cambia `shared/`. El componente maneja un
estado local booleano `open` (mostrado/oculto) y un id único para el enlace ARIA.

Tokens de diseño (en `:root`, iguales en ambos temas — el look «oscuro» es intencional y
constante; se definen en `:root` base, no solo dentro de una media query):

```css
--tooltip-bg: #232834;      /* pizarra oscura, legible sobre fondo claro y oscuro */
--tooltip-fg: #eef2f8;      /* texto claro */
--tooltip-border: rgba(255, 255, 255, 0.08); /* hairline para separarlo del fondo oscuro */
--tooltip-shadow: 0 6px 20px rgba(2, 6, 23, 0.35);
```

Métricas de la burbuja: `radius 6px`, `padding 6px 9px`, `font-size 12px`, `font-weight
500`, `line-height 1.35`, `max-width 220px`, `z-index 50`. Flecha de `6px` del color
`--tooltip-bg`. Animación de entrada: `opacity 0→1` + `translateY 3px→0` (desde arriba en
`top`, desde abajo en `bottom`), `transition ~130ms ease-out`; **retardo de aparición al
hover ~350ms**, ocultado inmediato (sin retardo).

## Interfaces / API

**No hay endpoints ni cambios de contrato.** Todo es frontend.

- `web/src/components/Tooltip.tsx` (nuevo):
  ```tsx
  interface TooltipProps {
    label: string;                     // texto ya traducido (t('...') en el llamador)
    placement?: 'top' | 'bottom';      // por defecto 'top'
    children: React.ReactElement;      // el disparador (un único elemento)
  }
  ```
  - Renderiza un envoltorio `<span class="tt-wrap">` con el `children` y una burbuja
    `<span role="tooltip" id={id} class="tt-bubble tt-<placement>">{label}</span>`.
  - Inyecta `aria-describedby={id}` en el `children` (vía `cloneElement`).
  - `open` se activa en `onMouseEnter`/`onFocus` (capturando el foco del disparador) y se
    desactiva en `onMouseLeave`/`onBlur` y con `Escape` (`onKeyDown`).
  - La burbuja permanece en el DOM; su visibilidad la gobierna la clase/estado `open` (para
    que RTL pueda verificarla; jsdom no aplica `:hover`).
- Sitios de uso: los componentes listados en Alcance envuelven su icono/control con
  `<Tooltip label={t('clave')} placement="…">…</Tooltip>` y **quitan** el `title`.

## Plan de implementación

1. Crear `Tooltip.tsx` con el estado `open`, el id ARIA, los handlers (hover/focus/blur/
   Escape) y el `cloneElement` que añade `aria-describedby`. Verificación: `npm run
   typecheck` en verde.
2. Estilos en `styles.css`: tokens `--tooltip-*` en `:root`, `.tt-wrap`, `.tt-bubble`,
   flecha, `.tt-top`/`.tt-bottom` y la animación. Verificación: se ve bien en claro y
   oscuro.
3. `OsIcon.tsx` e `IdentityPrefix.tsx`: envolver con `<Tooltip placement="top">` y quitar el
   `title`. Verificación: el DOM ya no tiene `title`; aparece la burbuja al hover/focus.
4. `ThemeToggle`, `LanguageSwitcher`, `ShareInvite`, `NotificationToggle`: envolver el
   control con `<Tooltip placement="bottom">` y quitar el `title`; conservar `aria-label`.
   Verificación: tooltips bajo la cabecera, sin recorte superior.
5. Actualizar los tests de SPEC 10/11 que usaban `getByTitle`/`toHaveAttribute('title')`
   para consultar la burbuja (`role="tooltip"` o su texto) tras hover/focus. Verificación:
   `npm run test:web` en verde.
6. Tests nuevos de `Tooltip`. Verificación: `npm run test:web -- --coverage` ≥90%.

## Criterios de aceptación

- [ ] Al hacer **hover** sobre un icono/control con tooltip, aparece una burbuja estilizada
      (fondo oscuro, texto claro, flecha) con el texto traducido.
- [ ] Al **enfocar con teclado** (Tab) el disparador, la burbuja aparece; al hacer `blur`,
      desaparece.
- [ ] **Escape** oculta la burbuja mientras el disparador está enfocado.
- [ ] El disparador expone `aria-describedby` apuntando al `id` de la burbuja, que tiene
      `role="tooltip"`.
- [ ] Ya **no** existe el atributo `title` en esos elementos (sin tooltip nativo del SO).
- [ ] Los tooltips de la **cabecera** usan placement `bottom`; los de iconos de SO/tipo,
      `top`.
- [ ] El texto del tooltip cambia con el **idioma** (reusa las claves i18n existentes).
- [ ] La burbuja es legible en **tema claro y oscuro** (tokens `--tooltip-*`).
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] Cobertura `web/src` ≥90% en las 4 métricas.

## Decisiones

- **Sí:** componente propio en CSS + React. Sin dependencia; encaja con la estética y el
  sistema de tokens de la app.
- **No:** Bootstrap / MaterialUI. Aportan una librería entera (y su runtime) por un tooltip;
  contradice el objetivo de bundle mínimo del proyecto.
- **Sí:** look **oscuro compacto** (tipo Bootstrap), constante en ambos temas. Un tooltip
  oscuro es legible sobre fondo claro y oscuro; se separa del fondo oscuro con hairline +
  sombra.
- **Sí:** mostrar por **estado JS** (`open`) además del CSS, para que sea testeable (jsdom
  no aplica `:hover`) y para poder cerrar con Escape.
- **Sí:** `aria-describedby` + `role="tooltip"` (patrón WAI-ARIA), conservando los
  `aria-label` de los controles.
- **No (por ahora):** flip automático contra el borde del viewport. Se elige placement por
  sitio (`bottom` en cabecera, `top` en iconos bajos); medir en JS es otra spec si hace
  falta.
- **Sí:** retardo de aparición al hover (~350ms) para evitar parpadeo al pasar el ratón;
  foco de teclado inmediato.
- **Sí:** eliminar el `title` para no duplicar tooltip nativo + propio.

## Casos borde

- **Disparador al borde superior de la ventana** (cabecera) → placement `bottom` evita que
  la burbuja se recorte por arriba. (El flip automático queda fuera de alcance.)
- **Foco y hover simultáneos** → un único estado `open`; salir del hover con el foco aún
  puesto mantiene la burbuja hasta el `blur` (coherente con teclado).
- **Escape** → oculta la burbuja sin cerrar el popover de `ShareInvite` ni otros overlays
  (el handler del tooltip no debe tragarse el evento para otros consumidores).
- **`children` no es un único elemento** → el componente asume un único `ReactElement`
  (contrato de `cloneElement`); documentarlo. Pasar varios hijos es un error de uso.
- **Texto largo** → `max-width` con salto de línea; no desborda la ventana horizontalmente.
- **Idioma CJK** → la burbuja crece con el contenido; sin recorte.
- **Táctil (sin hover)** → no se muestra la burbuja; el `aria-label` del control sigue
  dando el nombre accesible (degradación aceptada).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Tests de SPEC 10/11 que usan `getByTitle` se rompen al quitar `title` | Migrarlos a consultar `role="tooltip"`/texto tras hover/focus; parte del plan (paso 5). |
| Burbuja recortada contra los bordes del viewport | Placement estático adecuado por sitio; flip dinámico queda fuera de alcance y anotado. |
| Doble tooltip (nativo + propio) si se olvida quitar algún `title` | Criterio de aceptación explícito: no debe quedar `title` en esos elementos. |
| `cloneElement` sobre children múltiples | Contrato de un único `ReactElement`; typecheck lo acota. |
| z-index insuficiente y burbuja tapada por otros elementos | `z-index: 50` sobre la burbuja; verificar contra topbar y lista de mensajes. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Reposicionamiento/flip dinámico contra el viewport y placements laterales.
- Tooltips con contenido rico (HTML) o interactivo.
- Tooltips en elementos que hoy no tienen `title` (Landing, etc.).
- Añadir Bootstrap/MaterialUI u otra librería de UI.

Cada uno, si llega, va en su propia spec.
