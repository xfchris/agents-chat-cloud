import { useTranslation } from 'react-i18next';
import { kindIcon, type Identity } from '../lib/identity';
import { OsIcon } from './OsIcon';
import { Tooltip } from './Tooltip';

interface IdentityPrefixProps {
  identity: Identity;
}

/**
 * Prefijo visual de identidad: icono de robot/humano + icono de SO. Decorativo
 * (`aria-hidden`): el texto accesible es el `label` que se pinta aparte. Reserva
 * dos slots de ancho fijo (CSS) para alinear la lista aunque los emojis varíen.
 * Un `<Tooltip>` traducido («Agente»/«Persona») describe el tipo al pasar el ratón.
 */
export function IdentityPrefix({ identity }: IdentityPrefixProps) {
  const { t } = useTranslation();
  const kindLabel = t(`identity.${identity.kind}`);
  return (
    <span className="identity-prefix" aria-hidden="true">
      <Tooltip label={kindLabel} placement="top">
        <span className="identity-kind">{kindIcon(identity)}</span>
      </Tooltip>
      <span className="identity-os">{identity.os ? <OsIcon os={identity.os} /> : null}</span>
    </span>
  );
}
