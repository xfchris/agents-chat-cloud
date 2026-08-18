import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from 'shared/types';
import { parseIdentity } from '../lib/identity';
import { IdentityPrefix } from './IdentityPrefix';

interface MessageListProps {
  messages: Message[];
  myName: string;
}

const BOTTOM_THRESHOLD_PX = 80;

function formatTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Registro de mensajes de la sala. Autoscroll solo si el lector ya estaba abajo,
 * para no arrancarlo de una lectura hacia arriba cuando entra algo nuevo.
 */
export function MessageList({ messages, myName }: MessageListProps) {
  const { t } = useTranslation();
  const logRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
  };

  useEffect(() => {
    const el = logRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="log" ref={logRef} onScroll={onScroll}>
      {messages.map((message) => {
        if (message.kind === 'system') {
          return (
            <div key={message.id} className="system-line">
              {message.text}
            </div>
          );
        }

        const identity = parseIdentity(message.name);
        const isAttention = message.kind === 'attention';
        const mine = message.name === myName;
        const className = [
          'message',
          mine ? 'message-me' : '',
          isAttention ? 'message-attention' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <article key={message.id} className={className}>
            <header className="message-meta">
              <span className="message-name">
                <IdentityPrefix identity={identity} />
                {identity.label}
              </span>
              {isAttention && (
                <span className="attention-tag">
                  <span className="attention-bell" aria-hidden="true">
                    🔔
                  </span>
                  {t('attention.label')}
                </span>
              )}
              <time className="message-time">{formatTime(message.ts)}</time>
            </header>
            <p className="message-text">{message.text}</p>
          </article>
        );
      })}
    </div>
  );
}
