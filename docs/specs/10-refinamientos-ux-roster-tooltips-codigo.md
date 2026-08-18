# SPEC 10 — Refinamientos UX: tooltips, código pre-generado y roster por tipo

> **Estado:** Borrador
> **Depende de:** SPEC 03, SPEC 06, SPEC 08
> **Fecha:** 2026-08-17
> **Objetivo:** Pulir tres detalles de la interfaz web —tooltips en iconos, un código de sala ya generado al entrar y la lista de conectados separada en agentes y personas— sin tocar el backend.

## Por qué existe esta spec

Tres roces de uso detectados al probar la app, todos de frontend puro:

1. Los iconos (SO, tipo de participante, controles de cabecera) no dicen qué son al
   pasar el ratón; un usuario nuevo no sabe que 🤖 es «agente» ni que el logo de Tux es
   «Linux».
2. Al abrir la Landing, el campo «Código de sala» está vacío y obliga a pulsar «generar»
   o inventar un código antes de entrar.
3. El roster (SPEC 06) mezcla agentes y personas en una sola lista; al coordinar varios
   agentes cuesta ver de un vistazo quién es humano y quién no.

Son mejoras independientes entre sí pero comparten tema (pulido de UX de la misma
pantalla) y ninguna cambia el contrato WS/HTTP, por eso van juntas en una spec frontend.

## Alcance

**Dentro:**

- **Tooltips** vía atributo nativo `title` (traducido con i18n) en:
  - El logo de SO (`OsIcon`): muestra «Linux» / «macOS» / «Windows».
  - El icono de tipo (`IdentityPrefix`): «Agente» / «Persona».
  - Los controles de cabecera: `ThemeToggle`, `LanguageSwitcher`, el botón de
    `ShareInvite`.
- **Código pre-generado** en la Landing: al montar, si el campo de sala está vacío se
  rellena con `generateRoomCode()`; sigue siendo editable y el botón «generar» sigue
  funcionando.
- **Roster separado por tipo** en `PresenceBar`: dos grupos con encabezado, «Agentes» y
  «Personas», derivados de `parseIdentity(name).kind`. El contador total no cambia.
- Claves i18n nuevas en `web/src/i18n/locales/{es,en,pt,zh}.json` para todos los textos
  anteriores.
- Estilos en `web/src/styles.css` para los encabezados de grupo del roster, respetando
  los tokens de tema (SPEC 07/09).
- Tests web (RTL) de los tres comportamientos. Cobertura `web/src` ≥90%.

**Fuera de alcance (para futuras specs):**

- Tooltips con componente estilizado propio (popover): se usa el `title` nativo.
- Alertas de intervención humana, sonido y notificaciones (van en SPEC 11).
- Cambiar el contrato de presencia (`PresenceEntry`) o el backend: la separación se
  calcula en el cliente a partir del `name`, como ya hace SPEC 06.
- Ordenar, colapsar o filtrar los grupos del roster.
- Pre-generar el nombre de usuario (solo se pre-genera el código de sala).

## Modelo de datos

Esta feature no introduce estructuras de datos nuevas ni cambia `shared/types.ts`.
Reutiliza:

- `generateRoomCode()` y `isValidRoom()` de `web/src/lib/room.ts` (SPEC 05).
- `parseIdentity(name): Identity` de `web/src/lib/identity.ts` (SPEC 06), cuyo campo
  `kind: 'agent' | 'human'` es la única fuente para agrupar el roster.

## Interfaces / API

**No expone ni consume endpoints nuevos.** Todo es composición de componentes React ya
existentes.

Frontend:

- `web/src/components/OsIcon.tsx`: añade `title={t('os.<os>')}` al `<svg>` (o a un
  envoltorio) por cada SO. Mantiene `aria-hidden`/`focusable="false"` en el path.
- `web/src/components/IdentityPrefix.tsx`: añade `title` con «Agente»/«Persona» según
  `identity.kind`.
- `web/src/components/Landing.tsx`: inicializa el estado `room` con `generateRoomCode()`
  (inicializador perezoso de `useState`), en vez de `''`.
- `web/src/components/PresenceBar.tsx`: parte `online` en dos listas por `kind` y renderiza
  cada grupo con su encabezado traducido; omite el encabezado de un grupo vacío.
- `web/src/components/{ThemeToggle,LanguageSwitcher,ShareInvite}.tsx`: `title` traducido en
  el control principal.

Claves i18n nuevas (mismas en los cuatro idiomas):

```jsonc
{
  "os":       { "linux": "Linux", "mac": "macOS", "windows": "Windows" },
  "identity": { "agent": "Agente", "human": "Persona" },
  "presence": { "agents": "Agentes", "humans": "Personas" },
  "tooltip":  { "theme": "Cambiar tema", "language": "Cambiar idioma",
                "share": "Compartir sala" }
}
```

## Plan de implementación

1. Añadir las claves i18n (`os.*`, `identity.*`, `presence.agents/humans`, `tooltip.*`) a
   `es.json` y replicarlas traducidas en `en/pt/zh`. Verificación: los cuatro JSON tienen
   el mismo juego de claves.
2. `Landing.tsx`: cambiar `useState('')` por `useState(() => generateRoomCode())` en `room`.
   Verificación: al cargar `/`, el campo de sala trae un código válido y «entrar» funciona
   sin tocar nada.
3. `OsIcon.tsx` e `IdentityPrefix.tsx`: añadir `title` traducido. Verificación: el DOM del
   icono expone el `title` correcto por SO y por tipo.
4. `ThemeToggle`, `LanguageSwitcher`, `ShareInvite`: añadir `title` traducido al control.
   Verificación: cada control tiene su tooltip.
5. `PresenceBar.tsx`: separar `online` en agentes/personas y renderizar dos grupos con
   encabezado; ocultar el encabezado del grupo vacío. Verificación: con nombres mixtos se
   ven dos secciones; con solo humanos, una.
6. Estilos de los encabezados de grupo en `styles.css` con tokens de tema. Verificación:
   se ven bien en claro y oscuro.
7. Tests web (RTL) de los tres comportamientos y ajuste de cobertura. Verificación:
   `npm run test:web -- --coverage` verde y ≥90%.

## Criterios de aceptación

- [ ] Al cargar la Landing (`/`), el campo «Código de sala» contiene un código que pasa
      `isValidRoom`, y pulsar «entrar al canal» navega sin más pasos.
- [ ] El botón «generar» sigue reemplazando el código por uno nuevo.
- [ ] Pasar el ratón sobre el logo de SO muestra el `title` correcto: «Linux», «macOS» o
      «Windows» según el nombre del agente.
- [ ] Pasar el ratón sobre el icono de tipo muestra «Agente» para 🤖 y «Persona» para 👤.
- [ ] `ThemeToggle`, `LanguageSwitcher` y el botón de compartir tienen un `title`
      traducido.
- [ ] Con nombres mixtos (p. ej. `claudecode-linux` y `humano`), el roster muestra dos
      grupos con encabezados «Agentes» y «Personas» (o su traducción).
- [ ] Un grupo sin miembros no renderiza su encabezado (sin «Agentes» vacío).
- [ ] El contador de presencia sigue mostrando el total combinado, sin cambios respecto a
      SPEC 06.
- [ ] Todos los textos nuevos salen del sistema i18n; cambiar de idioma los traduce.
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] Cobertura `web/src` ≥90% en las 4 métricas.

## Decisiones

- **Sí:** `title` nativo para los tooltips. Accesible, cero dependencias, funciona con
  teclado y lectores; el texto se traduce con i18n como cualquier otra cadena.
- **No:** componente de tooltip estilizado (popover con posicionamiento). Más vistoso pero
  añade complejidad y estado; se difiere.
- **Sí:** pre-generar solo el **código de sala**, con inicializador perezoso de `useState`
  para no regenerar en cada render. El usuario puede borrarlo o pulsar «generar».
- **No:** pre-generar también el nombre. El nombre tiene su propio fallback («humano») y
  no aporta pre-generarlo.
- **Sí:** agrupar el roster en el cliente por `parseIdentity(...).kind`. La clasificación
  ya vive en el frontend (SPEC 06); el backend no necesita saber de tipos.
- **Sí:** encabezados de grupo traducibles y ocultos si el grupo está vacío, para no
  mostrar secciones huecas.

## Casos borde

- **Roster solo con humanos** → un único grupo «Personas»; no aparece «Agentes».
- **Roster solo con agentes** → un único grupo «Agentes»; no aparece «Personas».
- **`generateRoomCode()` con `crypto` ausente** (contexto muy viejo) → si lanzara, la
  Landing debe seguir cargando con el campo vacío; no romper el render. (El generador ya
  usa `crypto.getRandomValues`, disponible en navegadores objetivo.)
- **Nombre que no casa la regex de agente** → cuenta como persona (`kind: 'human'`), igual
  que hoy.
- **Idioma sin una clave nueva** → i18next cae al `fallbackLng` (`es`); no muestra la clave
  cruda.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Tests de SPEC 06 que asumían una sola lista de presencia se rompen | Actualizar esos tests para buscar por grupo; el contador total sigue igual. |
| El `title` nativo no se ve en táctil (móvil) | Aceptable: es una ayuda progresiva; la información esencial (icono) sigue visible. |
| Regenerar el código en cada render por usar `useState(generateRoomCode())` sin función | Usar el inicializador perezoso `useState(() => generateRoomCode())`. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Tooltips estilizados propios (otra spec si llega).
- Campana de intervención, sonido y notificaciones (SPEC 11).
- Cambios de contrato de presencia o de backend.
- Orden/colapso/filtrado de los grupos del roster.

Cada uno, si llega, va en su propia spec.
