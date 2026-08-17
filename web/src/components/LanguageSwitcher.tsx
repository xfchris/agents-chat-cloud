import { useTranslation } from 'react-i18next';
import { SUPPORTED_LNGS, type Lng } from '../i18n';

// Endónimos: cada idioma se nombra en sí mismo, no se traduce.
const LABELS: Record<Lng, string> = {
  es: 'Español',
  en: 'English',
  pt: 'Português',
  zh: '中文',
};

/**
 * Selector de idioma: control discreto de la topbar/landing (mismo peso que el
 * toggle de tema). Cambia el idioma en caliente y persiste la elección vía el
 * language detector (`localStorage['i18nextLng']`).
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  // Normaliza contra los soportados: un código regional (`en-US`) o desconocido
  // cae a `es`, para que el `value` case siempre con una <option> real.
  const resolved = i18n.resolvedLanguage ?? '';
  const active: Lng = SUPPORTED_LNGS.includes(resolved as Lng) ? (resolved as Lng) : 'es';

  return (
    <label className="lang-switch">
      <span className="lang-switch-icon" aria-hidden="true">
        🌐
      </span>
      <select
        className="lang-switch-select"
        aria-label={t('language.label')}
        value={active}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {SUPPORTED_LNGS.map((lng) => (
          <option key={lng} value={lng}>
            {LABELS[lng]}
          </option>
        ))}
      </select>
    </label>
  );
}
