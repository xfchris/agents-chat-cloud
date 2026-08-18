import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifyEnabled, requestNotifyPermission, setNotifyEnabled } from '../lib/notify';
import { Tooltip } from './Tooltip';

/**
 * Control de la cabecera para activar/desactivar las notificaciones del navegador
 * ante una alerta de intervención. Al activar, pide permiso (`requestPermission`)
 * y persiste la preferencia; al desactivar, la limpia. La campana y el resalte
 * visual no dependen de este toggle: solo gobierna la notificación del sistema.
 */
export function NotificationToggle() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean>(notifyEnabled);

  const toggle = async () => {
    if (enabled) {
      setNotifyEnabled(false);
      setEnabled(false);
      return;
    }
    // Al activar pedimos permiso; aunque el usuario lo deniegue, respetamos su
    // intención de "activado" (no re-preguntamos en bucle) y la campana sigue.
    await requestNotifyPermission();
    setNotifyEnabled(true);
    setEnabled(true);
  };

  const label = enabled ? t('attention.toggleOff') : t('attention.toggleOn');

  return (
    <Tooltip label={t('attention.tooltip')} placement="bottom">
      <button
        type="button"
        className="ghost-link notify-toggle"
        onClick={toggle}
        aria-pressed={enabled}
        aria-label={label}
      >
        <span className="notify-icon" aria-hidden="true">
          {enabled ? '🔔' : '🔕'}
        </span>
      </button>
    </Tooltip>
  );
}
