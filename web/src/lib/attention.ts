import type { TFunction } from 'i18next';
import type { Message } from 'shared/types';
import { playBell } from './bell';
import { notifyEnabled, notifyPermissionGranted, showAttentionNotification } from './notify';

/** ¿La pestaña está en segundo plano? Defensivo si `document` no expone `hidden`. */
function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

/**
 * Reacción a una alerta de intervención recibida en vivo de otro participante:
 * la campana suena siempre (una vez por mensaje); la notificación del navegador
 * solo si el usuario la activó, el permiso está concedido y la pestaña está en
 * segundo plano (con la pestaña visible, campana y resalte bastan). El filtro de
 * "en vivo / ajeno" lo decide el llamador (useChat).
 */
export function fireAttentionAlert(msg: Message, t: TFunction): void {
  playBell();
  if (notifyEnabled() && notifyPermissionGranted() && documentHidden()) {
    showAttentionNotification(msg, t);
  }
}
