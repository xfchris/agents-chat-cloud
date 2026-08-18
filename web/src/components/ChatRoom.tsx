import { Link, useParams } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { isValidRoom } from '../lib/room';
import { readStoredName } from '../lib/identity';
import { PresenceBar } from './PresenceBar';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ShareInvite } from './ShareInvite';

const STATUS_LABEL = {
  connecting: 'enlazando…',
  connected: 'en línea',
  disconnected: 'sin señal · reintentando…',
} as const;

/** Vista de una sala. Valida la ruta antes de abrir la conexión (hooks abajo). */
export function ChatRoom() {
  const { room = '' } = useParams();

  if (!isValidRoom(room)) {
    return (
      <main className="fallback">
        <p className="eyebrow">canal inexistente</p>
        <h1>«{room}» no es un canal válido</h1>
        <p className="fallback-text">
          Un código de sala usa 3–64 caracteres en minúscula, dígitos o guiones.
        </p>
        <Link className="ghost-link" to="/">
          ← volver a la entrada
        </Link>
      </main>
    );
  }

  // `key` fuerza un remonte limpio al cambiar de sala: estado e historial parten
  // de cero sin resetear a mano dentro del hook.
  return <Room key={room} room={room} />;
}

function Room({ room }: { room: string }) {
  // Nick fijo: se elige en la Landing y se lee una sola vez. No se edita en la sala.
  const name = readStoredName();
  const { messages, online, status, myName, sendMessage } = useChat(room, name);

  return (
    <main className="room">
      <header className="topbar">
        <div className="channel">
          <span className={`signal signal-${status}`} aria-hidden="true" />
          <span className="channel-name">
            <span className="channel-hash">#</span>
            {room}
          </span>
          <span className={`conn conn-${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        <p className="identity">
          <span className="identity-label">tú</span>
          <span className="identity-name mono">{myName}</span>
        </p>
        <ShareInvite room={room} />
        <Link className="ghost-link" to="/">
          salir
        </Link>
      </header>

      <PresenceBar online={online} myName={myName} />
      <MessageList messages={messages} myName={myName} />
      <Composer onSend={sendMessage} disabled={status !== 'connected'} />
    </main>
  );
}
