# SPEC 07 — Tema claro y oscuro

> **Estado:** Borrador
> **Depende de:** SPEC 03
> **Fecha:** 2026-08-17
> **Objetivo:** Permitir alternar entre tema oscuro y claro en toda la web, con un botón, respetando la preferencia del sistema por defecto y recordando la elección entre sesiones.

## Por qué existe esta spec

La UI actual ("signal room": fondo oscuro, acento teal, metadatos en monoespaciada) está
cableada a un solo esquema de color. Un tema claro es una petición explícita y una mejora
de accesibilidad para quien trabaja con luz alta. Para hacerlo sin duplicar estilos, los
colores deben pasar a **variables CSS** con dos juegos de valores conmutados por un
atributo en la raíz del documento.

## Alcance

**Dentro:**

- **Tokens de color** en `web/src/styles.css`: extraer los colores actuales a
  variables CSS (`--bg`, `--fg`, `--accent`, `--muted`, …) bajo `:root`.
- **Dos temas**: valores para claro y oscuro, conmutados por `data-theme="light"` /
  `data-theme="dark"` en `document.documentElement`.
- **Botón de tema** (`ThemeToggle`) visible en la cabecera de la sala y en la Landing,
  que alterna claro/oscuro (☀️/🌙).
- **Preferencia por defecto** = la del sistema (`prefers-color-scheme`); si el usuario
  elige explícitamente, esa elección **persiste** en `localStorage['theme']`.
- **Sin parpadeo** (FOUC): aplicar el tema antes de pintar (script inline en
  `web/index.html`).
- Tests web (RTL) del toggle, la persistencia y el default. Cobertura ≥90%.

**Fuera de alcance (para futuras specs):**

- Temas adicionales o personalización de acento por el usuario.
- Internacionalización del texto del botón (SPEC 08); aquí el toggle es un icono.
- Cambiar la identidad visual/estética base (paleta, tipografía).
- Tema para el `/brief` o cualquier salida de texto del backend (no aplica).

## Modelo de datos

Sin estructuras en `shared/`. Estado de cliente:

```ts
type Theme = 'light' | 'dark';
// localStorage['theme'] = 'light' | 'dark'  (ausente → seguir el sistema)
```

Regla de resolución al cargar:

1. Si `localStorage['theme']` es `'light'` o `'dark'` → usar ese.
2. Si no, `matchMedia('(prefers-color-scheme: dark)')` → `'dark'`, en otro caso
   `'light'`.

El tema aplicado se refleja siempre en `document.documentElement.dataset.theme`.

## Interfaces / API

**No hay endpoints ni cambios de contrato.**

Frontend:

- `web/src/lib/theme.ts` (nuevo):
  - `resolveTheme(): Theme` — aplica la regla de resolución de arriba.
  - `applyTheme(theme: Theme): void` — escribe `document.documentElement.dataset.theme`.
  - `storeTheme(theme: Theme): void` — persiste en `localStorage['theme']`.
- `web/src/components/ThemeToggle.tsx` (nuevo): botón que lee el tema actual, lo alterna,
  aplica y persiste. `aria-label` claro ("cambiar a tema claro/oscuro").
- Montaje de `<ThemeToggle />` en la cabecera de `ChatRoom` y en `Landing`.
- `web/index.html`: script inline mínimo que, antes de montar React, resuelve y aplica el
  tema (lee `localStorage['theme']` y `prefers-color-scheme`).

## Plan de implementación

1. `web/src/styles.css`: extraer los colores actuales a variables CSS bajo `:root` como
   **tema oscuro** (el actual), y añadir el bloque `:root[data-theme="light"]` con los
   valores claros. Sustituir los colores literales por `var(--…)`. Verificación:
   `npm run build` y revisión visual de que el oscuro se ve igual que antes.
2. `web/src/lib/theme.ts`: `resolveTheme`, `applyTheme`, `storeTheme`. Verificación:
   tests unitarios con `localStorage` y `matchMedia` mockeados.
3. `web/index.html`: script inline que aplica el tema antes del primer render (evita
   FOUC). Verificación: manual (recargar en claro no muestra flash oscuro).
4. `web/src/components/ThemeToggle.tsx`: botón que alterna y persiste. Verificación: test
   de click que cambia `data-theme` y `localStorage`.
5. Montar `<ThemeToggle />` en `ChatRoom` (cabecera) y `Landing`. Verificación: test de
   presencia del botón en ambas vistas.
6. Ajustar tests para cobertura ≥90%. Verificación: `npm run test:web -- --coverage`.

## Criterios de aceptación

- [ ] Existe un botón de tema visible en la sala (`/r/<sala>`) y en la Landing (`/`).
- [ ] Pulsarlo alterna entre claro y oscuro y el cambio es inmediato en toda la UI.
- [ ] La elección se guarda en `localStorage['theme']` y se conserva al recargar.
- [ ] Sin preferencia guardada, el tema inicial sigue a `prefers-color-scheme` del
      sistema.
- [ ] El tema aplicado se refleja en `document.documentElement` como
      `data-theme="light"` o `data-theme="dark"`.
- [ ] Al cargar con tema claro guardado, no hay parpadeo oscuro inicial (el script inline
      aplica el tema antes del render).
- [ ] En tema claro, texto y fondo cumplen contraste legible (AA) en los componentes
      principales (mensajes, composer, roster, cabecera).
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] Cobertura `web/src` ≥90% en las 4 métricas.

## Decisiones

- **Sí:** conmutar por `data-theme` en `:root` + variables CSS. Un solo árbol de estilos,
  sin duplicar componentes ni clases condicionales en JS.
- **No:** un `<link>` de hoja de estilos por tema. Provoca FOUC y complica el build.
- **Sí:** default = preferencia del sistema; la elección explícita la sobreescribe y
  persiste. Es el comportamiento esperado hoy en día.
- **Sí:** script inline en `index.html` para evitar FOUC. Es la técnica estándar; el
  coste es unas pocas líneas sin dependencias.
- **No:** biblioteca de theming (styled-components, etc.). El proyecto usa CSS plano;
  variables CSS bastan.
- **Sí:** toggle binario claro/oscuro (sin opción explícita "sistema" en la UI). Más
  simple; borrar `localStorage['theme']` reactiva el seguimiento del sistema (no
  expuesto en UI en esta spec).

## Casos borde

- **`localStorage` no disponible** (modo privado estricto) → `storeTheme` falla en
  silencio; el tema funciona en memoria durante la sesión, solo no persiste.
- **`matchMedia` ausente** (entornos de test antiguos) → fallback a `'dark'` (el tema
  base actual). Los tests mockean `matchMedia`.
- **Valor corrupto** en `localStorage['theme']` (algo distinto de light/dark) → se ignora
  y se cae al sistema.
- **SSR / primer paint**: no hay SSR (Vite SPA); el script inline corre en el cliente
  antes de React.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Colores literales olvidados sin migrar a variables | Revisión de `styles.css` buscando hex/rgb sueltos tras el paso 1; el tema claro los delataría visualmente. |
| Contraste insuficiente en claro | Elegir tokens claros con contraste AA y verificarlo en los componentes principales. |
| FOUC si el script inline se coloca mal | Debe ir en `<head>`, antes de cargar el bundle. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Internacionalización (SPEC 08); el botón de tema es un icono, no texto traducible.
- Temas extra o acento configurable por el usuario.
- Rediseño de la paleta o la tipografía base.

Cada uno, si llega, va en su propia spec.
