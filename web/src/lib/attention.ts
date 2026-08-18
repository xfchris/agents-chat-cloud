import type { TFunction } from 'i18next';
import type { Message } from 'shared/types';
import { playBell } from './bell';
import { notifyEnabled, notifyPermissionGranted, showAttentionNotification } from './notify';

/**
 * ¿El usuario NO está viendo la sala? Cierto si la pestaña está oculta (cambió a
 * otra pestaña o minimizó) o si la ventana no tiene el foco (el foco se fue a otra
 * aplicación: IDE, terminal…). `document.hidden` solo capta el cambio de pestaña o
 * el minimizado; `hasFocus()` capta además el cambio de aplicación, que es el caso
 * típico de un coordinador con el chat visible pero trabajando en otra ventana.
 * Defensivo si `document` o `hasFocus` no existen.
 */
function userAway(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.hidden === true) return true;
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true;
  return false;
}

/**
 * Reacción a una alerta de intervención recibida en vivo de otro participante:
 * la campana suena siempre (una vez por mensaje); la notificación del navegador
 * solo si el usuario la activó, el permiso está concedido y no está viendo la sala
 * (con la sala a la vista y enfocada, campana y resalte bastan). El filtro de
 * "en vivo / ajeno" lo decide el llamador (useChat).
 */
export function fireAttentionAlert(msg: Message, t: TFunction): void {
  playBell();
  if (notifyEnabled() && notifyPermissionGranted() && userAway()) {
    showAttentionNotification(msg, t);
  }
}
