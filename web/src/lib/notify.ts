import type { TFunction } from 'i18next';
import type { Message } from 'shared/types';

// Preferencia de notificaciones del navegador para alertas de intervención.
// Helpers puros y defensivos: `Notification` y `localStorage` pueden faltar
// (modo privado estricto, jsdom, navegadores sin la API) y ninguna llamada debe
// romper la sala. La preferencia vive en `localStorage['notifyOnAttention']`
// con valor `'1'` (activada) o ausente/otro (desactivada).

const STORAGE_KEY = 'notifyOnAttention';

/** ¿El usuario activó los avisos? Lee la preferencia persistida de forma segura. */
export function notifyEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persiste la preferencia; falla en silencio si `localStorage` no está disponible. */
export function setNotifyEnabled(value: boolean): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin localStorage: la preferencia vive solo en memoria esta sesión.
  }
}

/** ¿Existe la API de notificaciones en este navegador? */
function hasNotification(): boolean {
  return typeof Notification !== 'undefined';
}

/** ¿El permiso de notificación ya está concedido? */
export function notifyPermissionGranted(): boolean {
  if (!hasNotification()) return false;
  return Notification.permission === 'granted';
}

/**
 * Pide permiso de notificación. Devuelve el resultado (`'default'` si la API no
 * existe, para degradar sin romper). No re-pregunta si ya hay una decisión.
 */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!hasNotification()) return 'default';
  try {
    if (Notification.permission !== 'default') return Notification.permission;
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Muestra una notificación del sistema para un mensaje de alerta. Solo actúa si
 * la API existe y el permiso está concedido; el resto se decide en el llamador
 * (toggle activado, pestaña oculta). Título y cuerpo salen de i18n.
 */
export function showAttentionNotification(msg: Message, t: TFunction): void {
  if (!notifyPermissionGranted()) return;
  try {
    new Notification(t('attention.notifyTitle'), {
      body: t('attention.notifyBody', { name: msg.name }),
    });
  } catch {
    // Algunos navegadores exigen un Service Worker para `new Notification`:
    // degradamos en silencio (la campana y el resalte ya avisaron).
  }
}
