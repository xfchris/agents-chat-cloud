import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearMessages } from '../lib/api';
import { Tooltip } from './Tooltip';

/**
 * Botón «Borrar historial» de la cabecera con una confirmación en línea de dos
 * pasos (popover estilo `ShareInvite`: cierra con Escape y click-fuera, sin
 * `window.confirm`). Al confirmar hace `DELETE /r/:room/messages`; la vista NO se
 * vacía aquí: el backend difunde `{type:'cleared'}` por WS y `useChat` la refresca
 * (fuente única). Si el `fetch` falla, no se toca el historial.
 */
export function ClearHistory({ room }: { room: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cierre con Escape y click fuera mientras la confirmación está abierta.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const confirm = async () => {
    setOpen(false);
    try {
      await clearMessages(room);
    } catch {
      // Red caída: no vaciamos localmente. El borrado ocurre server-side y solo
      // entonces se difunde `cleared`; sin respuesta OK, la vista queda intacta.
    }
  };

  return (
    <div className="clear" ref={rootRef}>
      <Tooltip label={t('clear.tooltip')} placement="bottom">
        <button
          type="button"
          className="ghost-link clear-toggle"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('clear.button')}
          onClick={() => setOpen((prev) => !prev)}
        >
          {t('clear.button')}
        </button>
      </Tooltip>

      {open && (
        <div className="clear-popover" role="dialog" aria-label={t('clear.button')}>
          <p className="clear-confirm">{t('clear.confirm')}</p>
          <div className="clear-actions">
            <button type="button" className="clear-danger" onClick={confirm}>
              {t('clear.yes')}
            </button>
            <button type="button" className="clear-cancel" onClick={() => setOpen(false)}>
              {t('clear.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
