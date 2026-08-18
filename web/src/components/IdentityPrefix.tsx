import { kindIcon, type Identity } from '../lib/identity';
import { OsIcon } from './OsIcon';

interface IdentityPrefixProps {
  identity: Identity;
}

/**
 * Prefijo visual de identidad: icono de robot/humano + icono de SO. Decorativo
 * (`aria-hidden`): el texto accesible es el `label` que se pinta aparte. Reserva
 * dos slots de ancho fijo (CSS) para alinear la lista aunque los emojis varíen.
 */
export function IdentityPrefix({ identity }: IdentityPrefixProps) {
  return (
    <span className="identity-prefix" aria-hidden="true">
      <span className="identity-kind">{kindIcon(identity)}</span>
      <span className="identity-os">{identity.os ? <OsIcon os={identity.os} /> : null}</span>
    </span>
  );
}
