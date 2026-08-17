import { ROOM_RE } from 'shared/constants';
import { ChatRoom, type Env } from './chatroom';

// Detecta cualquier ruta bajo `/r/<segmento>`; la validez del `<segmento>` la
// decide ROOM_RE, no esta expresión, para poder responder 404 a salas inválidas
// (p. ej. `/r/AB` o `/r/x`) en lugar de servirlas como assets.
const ROOM_PATH_RE = /^\/r\/([^/]*)(\/.*)?$/;

// Subpaths que atiende la Durable Object. El resto bajo `/r/<room>` (incluido el
// `/r/<room>` pelado que navega el browser) lo sirve el SPA vía Static Assets.
const API_SUBPATHS = new Set(['/ws', '/brief', '/messages', '/presence']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = ROOM_PATH_RE.exec(url.pathname);

    if (!match) {
      // Todo lo que no cuelga de /r/... lo sirve el frontend (Static Assets).
      return env.ASSETS.fetch(request);
    }

    const room = match[1] ?? '';
    if (!ROOM_RE.test(room)) {
      // Sala inválida: 404 sea cual sea el subpath, sin tocar ninguna DO ni el SPA.
      return new Response('no encontrado', { status: 404 });
    }

    const rest = match[2] ?? '';
    if (!API_SUBPATHS.has(rest)) {
      // `/r/<room>` pelado o subpath no-API → SPA (deep-links / refresh de sala).
      return env.ASSETS.fetch(request);
    }

    // Subpath de API/WS: reescribe la URL sin el prefijo /r/<room> y delega en la DO.
    const innerUrl = new URL(url);
    innerUrl.pathname = rest;

    const proxied = new Request(innerUrl.toString(), request);
    proxied.headers.set('x-room', room);

    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    return stub.fetch(proxied);
  },
} satisfies ExportedHandler<Env>;

// wrangler necesita la clase exportada desde el `main` del Worker.
export { ChatRoom };
