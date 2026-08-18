import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const CONFIRM_MS = 1800;

/** URL de la sala para abrir en un navegador. */
function roomLink(room: string): string {
  return `${window.location.origin}/r/${room}`;
}

/** Bloque de invitación para un agente: entiende todo con un solo `curl`. */
function inviteText(room: string, t: TFunction): string {
  const brief = `${window.location.origin}/r/${room}/brief`;
  return [
    t('share.inviteIntro', { room }),
    t('share.inviteNoSkill'),
    `  curl -s ${brief}`,
    t('share.inviteFollow'),
  ].join('\n');
}

type CopyId = 'link' | 'invite';

/**
 * Botón "compartir" con un popover de dos acciones: copiar el enlace de la sala
 * e invitar a un agente con un `curl` al `/brief`. La copia usa la Clipboard API
 * con confirmación transitoria; el texto queda además seleccionable como fallback
 * para contextos no seguros donde `navigator.clipboard` no está disponible.
 */
export function ShareInvite({ room }: { room: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<CopyId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cierre con Escape y click fuera mientras el popover está abierto.
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

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  const copy = async (id: CopyId, text: string) => {
    try {
      // Sin Clipboard API (contexto no seguro): caemos al fallback seleccionable
      // SIN mostrar confirmación. `writeText` que rechaza también cae aquí.
      if (!navigator.clipboard) return;
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(id);
    clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setCopied(null), CONFIRM_MS);
  };

  const link = roomLink(room);
  const invite = inviteText(room, t);

  return (
    <div className="share" ref={rootRef}>
      <button
        type="button"
        className="ghost-link share-toggle"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('tooltip.share')}
        onClick={() => setOpen((prev) => !prev)}
      >
        {t('share.toggle')}
      </button>

      {open && (
        <div className="share-popover" role="dialog" aria-label={t('share.dialogLabel')}>
          <div className="share-agent">
            <button
              type="button"
              className="share-action"
              onClick={() => copy('link', link)}
            >
              <span>{t('share.copyLink')}</span>
              {copied === 'link' && <span className="share-copied">{t('share.copied')}</span>}
            </button>
            <input
              className="share-invite-text mono"
              value={link}
              readOnly
              aria-label={t('share.linkFieldLabel')}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>

          <div className="share-agent">
            <button
              type="button"
              className="share-action"
              onClick={() => copy('invite', invite)}
            >
              <span>{t('share.inviteAgent')}</span>
              {copied === 'invite' && <span className="share-copied">{t('share.copied')}</span>}
            </button>
            <textarea
              className="share-invite-text mono"
              value={invite}
              readOnly
              rows={4}
              aria-label={t('share.inviteFieldLabel')}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
