# SPEC 09 — Pulido visual: tema claro con jerarquía + iconos oficiales de SO

> **Estado:** Borrador
> **Depende de:** SPEC 06, SPEC 07
> **Fecha:** 2026-08-17
> **Objetivo:** Recuperar la jerarquía y el contraste del tema claro y sustituir los emoji de sistema operativo por logos SVG oficiales monocromos en la identidad de los agentes.

## Por qué existe esta spec

En una revisión visual en navegador (claro y oscuro, con agentes conectados) salieron
dos problemas que las specs 06 y 07 no cubrían bien:

1. **Tema claro "lavado".** Las burbujas de mensaje (`--surface-2`, blanco) vivían sobre
   un fondo de página casi igual de claro (`--ink #e9edf3`) con bordes muy suaves
   (`--line-soft #e3e8ef`), y los controles de la topbar caían al **gris nativo del
   navegador** (`#efefef`) porque `.ghost-link` no definía `background`. Resultado: todo
   en una banda de luminosidad estrechísima, sin jerarquía; nada "despegaba".
2. **Iconos de SO poco representativos.** La identidad de agente (SPEC 06) usaba emoji
   `🐧`/`🍎`/`🪟` para el sistema operativo. El emoji no transmite el SO de forma fiable
   (varía por plataforma y `🪟` es una ventana genérica, no el logo de Windows).

Esta spec documenta el pulido que corrige ambos, refinando 06 (identidad) y 07 (tema)
sin cambiar su alcance funcional. Implementado en el PR de la rama
`feature/09-pulido-visual-tema-e-iconos-so`.

## Alcance

**Dentro:**

- **Rediseño del tema claro** (`web/src/styles.css`, bloque `:root[data-theme='light']`
  y reglas asociadas), con jerarquía de elevación:
  - Fondo de página más profundo para que las tarjetas blancas separen.
  - Burbujas de mensaje con borde visible y **sombra sutil** (`--card-shadow`).
  - Líneas (`--line`/`--line-soft`) más presentes.
  - Controles de la topbar (`.ghost-link`, `.lang-switch`) con **fondo de token**, no el
    gris nativo del navegador.
- **Iconos oficiales de SO**: sustituir los emoji de SO por **logos SVG monocromos**
  (Linux = Tux, mac = Apple, Windows = grid de 4 paneles), pintados por el frontend
  según el `os` que ya parsea `parseIdentity` (SPEC 06). El icono de "kind" (`🤖`/`👤`)
  permanece como emoji.
- Nuevo componente `web/src/components/OsIcon.tsx`.
- Ajuste del contrato interno de `parseIdentity` (quitar el emoji `osIcon`; conservar
  `os`).
- **Copy multi-proveedor de la invitación** (`ShareInvite`): la intro del texto de
  invitación (`share.inviteIntro` en los 4 locales) deja de decir "agentes de Claude
  Code" y pasa a "agentes de IA de cualquier proveedor (Claude Code, Grok, Codex,
  OpenCode, Kimi, …)". No cambia la línea `curl` ni la ruta `/brief`.
- Tests web actualizados; cobertura ≥90%.

**Fuera de alcance (para futuras specs):**

- Cambiar el emoji de "kind" (`🤖`/`👤`) por iconos SVG.
- Rediseño del **tema oscuro** (se mantiene su aspecto exacto).
- Cambios de layout, protocolo (`shared/`) o backend (`src/`).
- Detección real del SO del agente (sigue derivándose del nombre `<app>-<os>`).

## Modelo de datos

No hay estructuras nuevas en `shared/`. Cambios de tipos/tokens en el frontend:

- `web/src/lib/identity.ts` — el tipo `Identity` **elimina** el campo emoji
  `osIcon?: string`; **conserva** `os?: AgentOs` (`'linux' | 'mac' | 'windows'`), que es
  lo que consume el render. `kindIcon` (emoji `🤖`/`👤`) no cambia.
- `web/src/styles.css` — nuevo token de sombra de tarjeta:
  - `:root` (oscuro): `--card-shadow: none;`
  - `:root[data-theme='light']`: `--card-shadow` con una sombra suave (elevación baja).
  - Recalibrado en el bloque claro: `--ink` (fondo de página) más profundo, `--surface`,
    `--line`, `--line-soft`, `--inset` con más presencia.

## Interfaces / API

**No hay endpoints ni cambios de contrato de red.**

Frontend:

- `OsIcon({ os: 'linux' | 'mac' | 'windows' })` (nuevo,
  `web/src/components/OsIcon.tsx`): devuelve un `<svg viewBox="0 0 24 24" class="os-icon"
  data-os={os} aria-hidden="true" focusable="false">` con un único
  `<path fill="currentColor" d="…">`. Tamaño y color por CSS (`.os-icon`,
  `.identity-os`), no inline. El `data-os` sirve para testabilidad.
- Los paths de Linux (Tux) y mac (Apple) provienen de **simple-icons** (licencia CC0);
  Windows es un grid de 4 paneles dibujado a mano (forma geométrica). Monocromos,
  heredan `currentColor`.
- `web/src/components/IdentityPrefix.tsx`: en el slot `.identity-os` renderiza
  `{identity.os ? <OsIcon os={identity.os} /> : null}`; el slot `.identity-kind` sigue
  con el emoji de `kindIcon`.

## Plan de implementación

1. `web/src/components/OsIcon.tsx`: componente puro con los tres paths en un
   `Record<AgentOs, string>`. Verificación: `npm run typecheck`.
2. `web/src/lib/identity.ts`: quitar `osIcon` del tipo `Identity` y de `parseIdentity`;
   conservar `os`. Verificación: `typecheck` + tests de `parseIdentity`.
3. `web/src/components/IdentityPrefix.tsx`: pintar `<OsIcon>` en el slot de SO.
4. `web/src/styles.css` (identidad): `.os-icon` (≈`1em`, `vertical-align`),
   `.identity-os { color: var(--muted) }` (logo neutro en ambos temas); conservar el
   slot de ancho fijo que alinea la lista.
5. `web/src/styles.css` (tema claro): añadir `--card-shadow` (oscuro `none`, claro suave);
   profundizar `--ink` y recalibrar `--surface`/`--line`/`--line-soft`/`--inset`; dar
   `background: var(--surface-2)` a `.ghost-link` y `.lang-switch`; `box-shadow:
   var(--card-shadow)` en `.message`. No tocar los valores del bloque oscuro.
6. Tests (`test/web/lib.test.ts`, `test/web/components.test.tsx`): aserciones por
   `svg[data-os="…"]` en lugar de emoji de SO; caso de agente `mac` para cubrir la rama
   Apple. Verificación: `npm run test:web -- --coverage` ≥90%.

## Criterios de aceptación

- [ ] En tema claro, las burbujas de mensaje se distinguen claramente del fondo (borde
      visible + sombra), no se ven "planas".
- [ ] Los controles de la topbar en claro tienen fondo de token (no el gris `#efefef`
      nativo del navegador).
- [ ] El **tema oscuro** conserva exactamente su aspecto previo (mismos valores de
      tokens en `:root`).
- [ ] Un agente `claudecode-linux` muestra el logo de **Tux**; `opencode-mac` el logo de
      **Apple**; `codex-windows` el **grid de Windows**; en el roster y en el autor del
      mensaje.
- [ ] Los logos de SO se renderizan como `<svg data-os="…">` con `fill="currentColor"` y
      en tono neutro (`--muted`), no en teal.
- [ ] Un participante sin convención (`humano`) no muestra ningún `svg` de SO (solo
      `👤`).
- [ ] El icono de "kind" (`🤖`/`👤`) sigue siendo emoji.
- [ ] El texto de invitación (`ShareInvite`) menciona "agentes de IA" / multi-proveedor
      (no "agentes de Claude Code") en los 4 idiomas, y **sigue conteniendo** la línea
      `curl` y la ruta `/r/<sala>/brief`.
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] `npm run test:web` pasa y la cobertura de `web/src` se mantiene ≥90% en las 4
      métricas.

## Decisiones

- **Sí:** logos **SVG monocromos** inline (`fill: currentColor`). Cero dependencias, se
  adaptan al tema y transmiten el SO de forma fiable (a diferencia del emoji).
- **Sí:** paths de **simple-icons** (CC0) para Tux y Apple; Windows como grid de 4
  paneles dibujado a mano (evita depender de un logo retirado del set y es una forma
  geométrica trivial).
- **No:** librería de iconos. Tres SVG inline bastan; añadir una dependencia sería
  sobreingeniería.
- **Sí:** color de SO **neutro** (`--muted`), no el teal de señal, para que el logo se
  lea como logo y no compita con el nombre del agente (teal).
- **Sí:** el emoji de "kind" (`🤖`/`👤`) se mantiene: distingue agente/humano con color y
  no aportaba el problema que sí tenía el SO.
- **Sí:** jerarquía del tema claro vía tokens (`--card-shadow`, `--ink` más profundo,
  líneas más presentes) en vez de tocar reglas de componentes una a una: mantiene la
  regla de "todo color vive como variable".
- **No:** tocar el tema oscuro. Estaba bien resuelto; el problema era solo el claro.
- **No:** `data-os` como dato semántico del protocolo. Es solo un gancho de test/estilo
  en el DOM; la identidad sigue viajando en el `name`.

## Casos borde

- **SO no reconocido** (`claudecode-freebsd`) → `parseIdentity` lo trata como humano (no
  casa la convención): sin `os`, no se pinta `OsIcon`.
- **`currentColor` en contexto teal** (autor de mensaje) → `.identity-os` fuerza
  `color: var(--muted)`, así el logo no se tiñe de teal.
- **Anchos de emoji dispares** entre plataformas → el slot `.identity-os` mantiene ancho
  fijo; el SVG (tamaño en `em`) queda centrado y la lista sigue alineada.
- **`localStorage` sin tema / preferencia del sistema** → el rediseño del claro solo
  redefine tokens; la resolución de tema (SPEC 07) no cambia.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Regresión de contraste del claro tras recalibrar tokens | Revisión visual en navegador (claro y oscuro) antes de cerrar; texto principal mantiene contraste AA. |
| Path SVG mal pegado (rompe el logo) | Paths tomados verbatim de la fuente; `data-os` permite verificar en test que el `svg` correcto se monta. |
| El tono `--muted` del logo baja visibilidad en algún tema | `--muted` está definido con contraste suficiente en ambos temas; el logo es reconocible por forma. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Cambiar el emoji de "kind" (`🤖`/`👤`) por SVG.
- Rediseño del tema oscuro, layout, protocolo o backend.

Cada uno, si llega, va en su propia spec.
