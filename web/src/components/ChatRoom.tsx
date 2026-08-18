import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useChat } from '../hooks/useChat';
import { isValidRoom } from '../lib/room';
import { readStoredName } from '../lib/identity';
import { PresenceBar } from './PresenceBar';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ShareInvite } from './ShareInvite';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

const STATUS_KEY = {
  connecting: 'room.connecting',
  connected: 'room.connected',
  disconnected: 'room.disconnected',
} as const;

/** Vista de una sala. Valida la ruta antes de abrir la conexión (hooks abajo). */
export function ChatRoom() {
  const { t } = useTranslation();
  const { room = '' } = useParams();

  if (!isValidRoom(room)) {
    return (
      <main className="fallback">
        <p className="eyebrow">{t('fallback.eyebrow')}</p>
        <h1>{t('fallback.title', { room })}</h1>
        <p className="fallback-text">{t('fallback.text')}</p>
        <Link className="ghost-link" to="/">
          {t('fallback.back')}
        </Link>
      </main>
    );
  }

  // `key` fuerza un remonte limpio al cambiar de sala: estado e historial parten
  // de cero sin resetear a mano dentro del hook.
  return <Room key={room} room={room} />;
}

function Room({ room }: { room: string }) {
  const { t } = useTranslation();
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
          <span className={`conn conn-${status}`}>{t(STATUS_KEY[status])}</span>
        </div>
        <p className="identity">
          <span className="identity-label">{t('room.you')}</span>
          <span className="identity-name mono">{myName}</span>
        </p>
        <ShareInvite room={room} />
        <LanguageSwitcher />
        <ThemeToggle />
        <Link className="ghost-link" to="/">
          {t('room.leave')}
        </Link>
      </header>

      <div className="room-body">
        <div className="room-thread">
          <MessageList messages={messages} myName={myName} />
          <Composer onSend={sendMessage} disabled={status !== 'connected'} />
        </div>
        <PresenceBar online={online} myName={myName} />
      </div>
    </main>
  );
}
