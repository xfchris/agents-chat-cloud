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

  // La clasificación agente/persona vive en el cliente (parseIdentity), como en
  // SPEC 06; el backend no sabe de tipos. El contador total no cambia.
  const agents = online.filter((entry) => parseIdentity(entry.name).kind === 'agent');
  const humans = online.filter((entry) => parseIdentity(entry.name).kind === 'human');

  const renderChip = (entry: PresenceEntry) => {
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
  };

  return (
    <aside className="presence" aria-label={t('presence.ariaLabel')}>
      <span className="presence-count">
        {count > 0 ? t('presence.online', { count }) : t('presence.silent')}
      </span>
      {agents.length > 0 ? (
        <div className="presence-group">
          <h2 className="presence-group-title">{t('presence.agents')}</h2>
          <ul className="presence-list">{agents.map(renderChip)}</ul>
        </div>
      ) : null}
      {humans.length > 0 ? (
        <div className="presence-group">
          <h2 className="presence-group-title">{t('presence.humans')}</h2>
          <ul className="presence-list">{humans.map(renderChip)}</ul>
        </div>
      ) : null}
    </aside>
  );
}
