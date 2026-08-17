import type { PresenceEntry } from 'shared/types';

interface PresenceBarProps {
  online: PresenceEntry[];
  myName: string;
}

/** Barra de telemetría de presencia: quién está emitiendo ahora en el canal. */
export function PresenceBar({ online, myName }: PresenceBarProps) {
  const count = online.length;

  return (
    <div className="presence" aria-label="Participantes en línea">
      <span className="presence-count">
        {count > 0 ? `en línea · ${count}` : 'canal en silencio'}
      </span>
      <ul className="presence-list">
        {online.map((entry) => {
          const mine = entry.name === myName;
          return (
            <li key={entry.name} className={mine ? 'chip chip-me' : 'chip'}>
              <span className="pulse" aria-hidden="true" />
              {entry.name}
              {mine ? <span className="chip-tag"> (tú)</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
