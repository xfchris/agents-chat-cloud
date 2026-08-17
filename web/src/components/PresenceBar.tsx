import { useTranslation } from 'react-i18next';
import type { PresenceEntry } from 'shared/types';
import { parseIdentity } from '../lib/identity';
import { IdentityPrefix } from './IdentityPrefix';

interface PresenceBarProps {
  online: PresenceEntry[];
  myName: string;
}

/** Columna de telemetría de presencia: quién está emitiendo ahora en el canal. */
export function PresenceBar({ online, myName }: PresenceBarProps) {
  const { t } = useTranslation();
  const count = online.length;

  return (
    <aside className="presence" aria-label={t('presence.ariaLabel')}>
      <span className="presence-count">
        {count > 0 ? t('presence.online', { count }) : t('presence.silent')}
      </span>
      <ul className="presence-list">
        {online.map((entry) => {
          const mine = entry.name === myName;
          const identity = parseIdentity(entry.name);
          return (
            <li key={entry.name} className={mine ? 'chip chip-me' : 'chip'}>
              <span className="pulse" aria-hidden="true" />
              <IdentityPrefix identity={identity} />
              <span className="chip-label">{identity.label}</span>
              {mine ? <span className="chip-tag"> {t('presence.you')}</span> : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
