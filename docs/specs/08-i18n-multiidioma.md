# SPEC 08 — Internacionalización (ES · EN · PT · ZH)

> **Estado:** Borrador
> **Depende de:** SPEC 03
> **Fecha:** 2026-08-17
> **Objetivo:** Traducir la interfaz web a cuatro idiomas (español, inglés, portugués y chino mandarín) con un selector, detectando el idioma del navegador por defecto y recordando la elección.

## Por qué existe esta spec

Toda la UI (`web/src/`) tiene los textos cableados en español. Para abrir el producto a
más usuarios se necesita internacionalización real: una capa de traducción, ficheros de
recursos por idioma y un selector. Se elige **react-i18next** (estándar del ecosistema
React) para no reinventar detección, cambio en caliente e interpolación.

## Alcance

**Dentro:**

- Dependencias: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
- Inicialización en `web/src/i18n/index.ts`: recursos, `fallbackLng: 'es'`, detección y
  persistencia.
- **Recursos** por idioma en `web/src/i18n/locales/{es,en,pt,zh}.json`, con **todas** las
  cadenas de UI actuales bajo claves estables.
- **Reemplazo** de los textos cableados en los componentes por `t('clave')`
  (`Landing`, `ChatRoom`, `PresenceBar`, `MessageList`, `Composer`, fallback de sala
  inválida, estados de conexión).
- **Selector de idioma** (`LanguageSwitcher`) en la cabecera de la sala y en la Landing:
  Español · English · Português · 中文.
- **Detección** por defecto: idioma del navegador (`navigator.language`), con `es` de
  reserva; la elección explícita **persiste** en `localStorage` (`i18nextLng`).
- Tests web (RTL) del cambio de idioma, la detección y el fallback. Cobertura ≥90%.

**Fuera de alcance (para futuras specs):**

- Traducir el backend: `/brief`, mensajes `kind:'system'` ("Sala <room> creada") y
  cualquier texto de `src/`. Permanecen en español.
- Localización de fechas/números (`Intl`) más allá de lo que ya se muestre.
- Idiomas adicionales o RTL (árabe/hebreo).
- Traducir contenido escrito por los usuarios (mensajes del chat).

## Modelo de datos

Sin estructuras en `shared/`. Recurso de traducción = JSON plano de `clave → texto` por
idioma. Claves agrupadas por área (sugerencia, no normativa):

```jsonc
// web/src/i18n/locales/es.json
{
  "landing": { "roomLabel": "Código de sala", "nameLabel": "Tu nombre",
               "generate": "generar código", "enter": "entrar al canal →" },
  "room":    { "connecting": "enlazando…", "connected": "en línea",
               "disconnected": "sin señal · reintentando…", "leave": "salir" },
  "presence":{ "silent": "canal en silencio", "online": "en línea · {{count}}",
               "you": "(tú)" },
  "composer":{ "placeholder": "escribe un mensaje…", "send": "Enviar" }
}
```

- Idioma persistido: `localStorage['i18nextLng']` (clave por defecto del language
  detector). Valores: `es` | `en` | `pt` | `zh`.

## Interfaces / API

**No hay endpoints ni cambios de contrato.**

Frontend:

- `web/src/i18n/index.ts` (nuevo): `i18n.use(LanguageDetector).use(initReactI18next)
  .init({ resources, fallbackLng: 'es', supportedLngs: ['es','en','pt','zh'],
  detection: { order: ['localStorage','navigator'], caches: ['localStorage'] },
  interpolation: { escapeValue: false } })`. Se importa una vez desde `web/src/main.tsx`.
- `useTranslation()` (de `react-i18next`) en cada componente que muestre texto; `t('…')`
  sustituye las cadenas.
- `web/src/components/LanguageSwitcher.tsx` (nuevo): `<select>` (o botones) que llama a
  `i18n.changeLanguage(lng)`; refleja el idioma activo.
- Montaje de `<LanguageSwitcher />` en la cabecera de `ChatRoom` y en `Landing`.

## Plan de implementación

1. Instalar `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
   Verificación: `npm ci` y `npm run typecheck` en verde.
2. `web/src/i18n/locales/es.json`: volcar todas las cadenas actuales bajo claves.
   Verificación: revisión de que no queda texto de UI fuera del JSON.
3. `web/src/i18n/index.ts`: inicializar i18next con los recursos y la detección.
   Importarlo en `web/src/main.tsx`. Verificación: la app arranca en `es`.
4. Reemplazar textos cableados por `t('clave')` en cada componente. Verificación:
   `npm run test:web` (los tests que buscan textos en español siguen pasando en `es`).
5. Crear `en.json`, `pt.json`, `zh.json` con las mismas claves traducidas.
   Verificación: cambiar de idioma en runtime muestra las traducciones.
6. `web/src/components/LanguageSwitcher.tsx` + montaje en `ChatRoom` y `Landing`.
   Verificación: test de que seleccionar un idioma cambia los textos visibles.
7. Ajustar tests para cobertura ≥90%. Verificación: `npm run test:web -- --coverage`.

## Criterios de aceptación

- [ ] La UI arranca en el idioma del navegador si es uno de los soportados; si no, en
      español.
- [ ] Existe un selector de idioma en la sala (`/r/<sala>`) y en la Landing (`/`) con las
      opciones Español, English, Português y 中文.
- [ ] Seleccionar un idioma cambia inmediatamente los textos visibles (cabecera,
      presencia, composer, mensajes de estado, Landing).
- [ ] La elección persiste en `localStorage` y se conserva al recargar.
- [ ] Con idioma `en`, el botón de enviar dice "Send"; con `pt`, "Enviar"; con `zh`, su
      equivalente en chino; con `es`, "Enviar". (Ejemplo verificable de una clave.)
- [ ] No queda ningún texto de UI cableado en español fuera de los ficheros de recursos
      (salvo lo explícitamente fuera de alcance: backend/`brief`/mensajes de sistema).
- [ ] El contador de presencia interpola el número correctamente en cada idioma
      (`en línea · 3` / `online · 3` / …).
- [ ] `npm run typecheck`, `npm run lint` y `npm run build` pasan (exit 0).
- [ ] Cobertura `web/src` ≥90% en las 4 métricas.

## Decisiones

- **Sí:** `react-i18next`. Estándar, con detección, cambio en caliente e interpolación
  resueltos; evita mantener un `t()` propio.
- **No:** diccionario propio sin dependencia. Más ligero, pero reimplementa detección,
  interpolación y plurales; se descartó a favor del estándar.
- **Sí:** cuatro idiomas iniciales (es/en/pt/zh) con `es` como fallback.
- **Sí:** detección por `navigator` + persistencia en `localStorage['i18nextLng']`
  (comportamiento por defecto del language detector).
- **No:** traducir el backend. El `/brief` y los mensajes de sistema quedan en español;
  traducir texto de agentes es otra spec si llega.
- **Sí:** claves agrupadas por área (`landing.*`, `room.*`, `presence.*`, `composer.*`)
  para que el JSON sea legible y escale.

## Casos borde

- **Idioma del navegador no soportado** (p. ej. `de`) → fallback a `es`.
- **Falta una clave** en un idioma → i18next cae al `fallbackLng` (`es`) para esa clave;
  no muestra la clave cruda.
- **`localStorage` no disponible** → el idioma no persiste pero la sesión funciona;
  detección por `navigator` en cada carga.
- **Interpolación** (`{{count}}` en presencia) → debe renderizar el número, no el
  literal, en los cuatro idiomas.
- **Glifos CJK** (chino) → asegurarse de que la fuente base los muestra; si no, el
  navegador usa su fallback del sistema (aceptable).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Tests actuales que buscan texto en español se rompen | Arrancan en `es` por defecto; las aserciones siguen válidas. Los tests de cambio de idioma fijan el idioma explícitamente. |
| Claves huérfanas o desincronizadas entre idiomas | Misma estructura de claves en los cuatro JSON; una prueba puede comparar los juegos de claves. |
| Peso extra del bundle por i18next | Aceptable; son librerías pequeñas y la app es SPA. |
| Traducciones al chino de baja calidad | Marcar como revisables; el objetivo de la spec es la infraestructura i18n, no la calidad lingüística final. |

## Preguntas abiertas

Ninguna.

## Lo que **no** entra en esta spec

- Traducción del backend (`/brief`, mensajes `kind:'system'`, cualquier texto de `src/`).
- Idiomas adicionales, RTL o localización de fechas/números.
- Traducción del contenido escrito por los usuarios.

Cada uno, si llega, va en su propia spec.
