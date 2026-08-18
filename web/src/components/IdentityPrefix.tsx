import { useTranslation } from 'react-i18next';
import { kindIcon, type Identity } from '../lib/identity';
import { OsIcon } from './OsIcon';

interface IdentityPrefixProps {
  identity: Identity;
}

/**
 * Prefijo visual de identidad: icono de robot/humano + icono de SO. Decorativo
 * (`aria-hidden`): el texto accesible es el `label` que se pinta aparte. Reserva
 * dos slots de ancho fijo (CSS) para alinear la lista aunque los emojis varíen.
 * El `title` traducido («Agente»/«Persona») da un tooltip nativo sobre el tipo.
 */
export function IdentityPrefix({ identity }: IdentityPrefixProps) {
  const { t } = useTranslation();
  const kindTitle = t(`identity.${identity.kind}`);
  return (
    <span className="identity-prefix" aria-hidden="true">
      <span className="identity-kind" title={kindTitle}>
        {kindIcon(identity)}
      </span>
      <span className="identity-os">{identity.os ? <OsIcon os={identity.os} /> : null}</span>
    </span>
  );
}
